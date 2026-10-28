import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{Leaderboard} from '../worker.mjs';
import {qualifies,playerName} from '../leaderboard-model.mjs';

class Storage {
    constructor(){this.values=new Map();this.alarm=null;this.lock=Promise.resolve();}
    async get(key){return structuredClone(this.values.get(key));}
    async put(key,value){this.values.set(key,structuredClone(value));}
    async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])this.values.delete(key);}
    async list({prefix='',limit=Infinity}={}){return new Map([...this.values].filter(([key])=>key.startsWith(prefix)).slice(0,limit));}
    async getAlarm(){return this.alarm;}
    async setAlarm(value){this.alarm=value;}
    async transaction(fn){const previous=this.lock;let release;this.lock=new Promise(resolve=>release=resolve);await previous;try{return await fn(this);}finally{release();}}
}
function setup(){
    const storage=new Storage(),object=new Leaderboard({storage});let now=1000000;object.now=()=>now;
    const get=()=>object.fetch(new Request('https://mirror.test/api/leaderboard')).then(r=>r.json());
    const start=async()=>{const r=await object.fetch(new Request('https://mirror.test/api/rounds',{method:'POST'}));assert.equal(r.status,201);return (await r.json()).roundId;};
    const categories=score=>{const result={};for(const key of ['mouth','teeth','motion','eyes']){result[key]=Math.min(250,score);score-=result[key];}return result;};
    const submit=(roundId,score,name='Ghost',extra={})=>object.fetch(new Request('https://mirror.test/api/leaderboard',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roundId,score,name,categories:categories(score),...extra})}));
    return {object,storage,get,start,submit,advance:ms=>now+=ms};
}
test('scores persist across object instances and are visible to different visitors',async()=>{
    const s=setup(),id=await s.start();s.advance(11000);
    assert.equal((await s.submit(id,700,'Night Ghost')).status,201);
    const other=new Leaderboard({storage:s.storage});
    const entries=(await (await other.fetch(new Request('https://mirror.test/api/leaderboard'))).json()).entries;
    assert.equal(entries[0].name,'Night Ghost');assert.equal(entries[0].score,700);
});
test('score submissions validate names, timing, category totals, and one-use tickets',async()=>{
    const s=setup(),id=await s.start();
    assert.equal((await s.submit(id,700)).status,425);
    s.advance(11000);
    assert.equal((await s.submit(id,700,'   ')).status,400);
    assert.equal((await s.submit(id,700,'A'.repeat(25))).status,400);
    assert.equal((await s.submit(id,700,'Ghost',{categories:{mouth:10,teeth:0,motion:0,eyes:0}})).status,400);
    assert.equal((await s.submit(id,700,'Ghost')).status,201);
    assert.equal((await s.submit(id,700,'Ghost')).status,200);
    assert.equal((await s.submit(id,800,'Other')).status,409);
    assert.equal((await s.get()).entries.length,1);
});
test('top ten are ordered, capped, and rechecked when concurrent submissions arrive',async()=>{
    const s=setup(),ids=[];for(let i=0;i<12;i++)ids.push(await s.start());s.advance(11000);
    await Promise.all(ids.slice(0,10).map((id,i)=>s.submit(id,500+i,'Ghost '+i)));
    const cutoff=(await s.get()).entries.at(-1).score;
    assert.equal(cutoff,500);
    assert.equal(qualifies((await s.get()).entries,501),true);
    await s.submit(ids[10],800,'New challenger');
    const losing=await (await s.submit(ids[11],501,'Late ghost')).json();
    assert.equal(losing.saved,false,'equal cutoff loses its spot to earlier scores');
    const entries=(await s.get()).entries;
    assert.equal(entries.length,10);assert.equal(entries[0].score,800);assert.equal(entries.at(-1).score,501);
    assert.ok(entries.every((entry,i)=>i===0 || entries[i-1].score>=entry.score));
});
test('tickets expire, rate limits apply, and cleanup preserves the scoreboard',async()=>{
    const s=setup(),id=await s.start();s.advance(11000);await s.submit(id,500);
    const expired=await s.start();s.advance(15*60*1000+1);
    assert.equal((await s.submit(expired,600)).status,410);
    await s.object.alarm();assert.equal((await s.get()).entries.length,1);
    for(let i=0;i<12;i++)await s.start();
    const limited=await s.object.fetch(new Request('https://mirror.test/api/rounds',{method:'POST'}));
    assert.equal(limited.status,429);
});
test('qualification and names handle cutoff ties and unicode consistently',()=>{
    assert.equal(qualifies([],0),false);assert.equal(qualifies([],1001),false);
    const entries=Array.from({length:10},(_,i)=>({score:1000-i}));
    assert.equal(qualifies(entries,991),false);assert.equal(qualifies(entries,992),true);
    assert.equal(playerName('  Night   Ghost  '),'Night Ghost');assert.equal(playerName('Ghost\u202e'),null);
});
test('worker serves static assets, rejects cross-origin submissions, and reports missing storage',async()=>{
    const assets={fetch:async()=>new Response('mirror page')};
    assert.equal(await (await worker.fetch(new Request('https://mirror.test/'),{ASSETS:assets})).text(),'mirror page');
    assert.equal((await worker.fetch(new Request('https://mirror.test/api/rounds',{method:'POST',headers:{origin:'https://other.test'}}),{})).status,403);
    assert.equal((await worker.fetch(new Request('https://mirror.test/api/leaderboard'),{})).status,503);
});
