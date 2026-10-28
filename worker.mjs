import { qualifies, playerName, validScores, insertScore, SCORE_KEYS } from './leaderboard-model.mjs';
const ROUND_TTL=15*60*1000;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

async function bodyOf(request) {
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('Send JSON.');
    let text='';const reader=request.body?.getReader();
    if(!reader) throw new Error('Missing request body.');
    const decoder=new TextDecoder();
    while(true) {
        const {done,value}=await reader.read();if(done)break;
        text+=decoder.decode(value,{stream:true});
        if(text.length>2048) {await reader.cancel();throw new Error('Request is too large.');}
    }
    return JSON.parse(text+decoder.decode());
}

export default {
    async fetch(request,env) {
        const url=new URL(request.url);
        if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
        if(request.method==='POST') {
            const origin=request.headers.get('origin');
            if(origin && origin!==url.origin) return json({error:'Use this website to submit scores.'},403);
        }
        if(!env.LEADERBOARD) return json({error:'The shared leaderboard is not configured yet.'},503);
        try {
            const object=env.LEADERBOARD.get(env.LEADERBOARD.idFromName('haunted-mirror-top10-v1'));
            return await object.fetch(request);
        } catch(error) {
            console.error('Leaderboard request failed',error);
            return json({error:'The shared leaderboard is temporarily unavailable. Please try again.'},503);
        }
    }
};

// One persistent, SQLite-backed Durable Object serializes the shared top ten.
// The key/value API is transactional and backed by the object's SQLite database.
export class Leaderboard {
    constructor(ctx) {this.storage=ctx.storage;this.now=()=>Date.now();}
    async fetch(request) {
        const path=new URL(request.url).pathname;
        if(path==='/api/leaderboard' && request.method==='GET') return json({entries:await this.storage.get('top10')??[]});
        if(path==='/api/rounds' && request.method==='POST') return this.startRound(request);
        if(path==='/api/leaderboard' && request.method==='POST') {
            let body;
            try{body=await bodyOf(request);}catch{return json({error:'Invalid score submission.'},400);}
            return this.submit(body);
        }
        return json({error:'Unknown leaderboard endpoint.'},404);
    }
    async scheduleCleanup() {
        if(await this.storage.getAlarm()===null) await this.storage.setAlarm(this.now()+ROUND_TTL);
    }
    async startRound(request) {
        const now=this.now();
        const ip=request.headers.get('cf-connecting-ip')??'local-preview';
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
        const key='rate:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        const roundId=crypto.randomUUID();
        const allowed=await this.storage.transaction(async tx=>{
            const rate=await tx.get(key);
            const count=rate && rate.expiresAt>now ? rate.count : 0;
            if(count>=12) return false;
            await tx.put(key,{count:count+1,expiresAt:rate && rate.expiresAt>now ? rate.expiresAt : now+60000});
            await tx.put('round:'+roundId,{startedAt:now,expiresAt:now+ROUND_TTL});
            return true;
        });
        if(!allowed)return json({error:'Too many rounds started. Please wait a minute.'},429);
        await this.scheduleCleanup();
        return json({roundId},201);
    }
    async submit(body) {
        const name=playerName(body?.name),score=body?.score,categories=body?.categories;
        if(!name || !validScores(score,categories) || typeof body.roundId!=='string' || !/^[\da-f-]{36}$/i.test(body.roundId)) return json({error:'Enter a name of 1-24 characters and a valid finished score.'},400);
        const now=this.now();
        const result=await this.storage.transaction(async tx=>{
            const key='round:'+body.roundId,ticket=await tx.get(key);
            if(!ticket || ticket.expiresAt<now)return {status:410,error:'This round has expired. Play again to enter a new score.'};
            const entries=await tx.get('top10')??[];
            if(ticket.used) {
                if(ticket.entry && ticket.entry.name===name && ticket.entry.score===score) return {status:200,saved:true,entries,entry:ticket.entry};
                return {status:409,error:'This round has already been submitted.'};
            }
            if(now-ticket.startedAt<11000)return {status:425,error:'The round has not finished yet. Try saving again in a moment.'};
            if(!qualifies(entries,score)) {
                await tx.put(key,{...ticket,used:true});
                return {status:200,saved:false,entries};
            }
            const entry={id:body.roundId,name,score,categories:Object.fromEntries(SCORE_KEYS.map(key=>[key,categories[key]])),createdAt:now};
            const updated=insertScore(entries,entry);
            await tx.put('top10',updated);
            await tx.put(key,{...ticket,used:true,entry});
            return {status:201,saved:true,entries:updated,entry};
        });
        const {status,...response}=result;
        return json(response,status);
    }
    async alarm() {
        const now=this.now();
        for(const prefix of ['round:','rate:']) {
            const items=await this.storage.list({prefix});
            const expired=[...items].filter(([,item])=>item.expiresAt<=now).map(([key])=>key);
            if(expired.length)await this.storage.delete(expired);
        }
        const remaining=await this.storage.list({prefix:'round:',limit:1});
        if(remaining.size)await this.storage.setAlarm(now+ROUND_TTL);
    }
}
