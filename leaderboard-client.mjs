import { qualifies, playerName } from './leaderboard-model.mjs';

export function createLeaderboard(doc=document,request=fetch) {
    const el=id=>doc.getElementById(id);
    const dialog=el('leaderboardDialog'),form=el('scoreForm'),input=el('playerName');
    const status=el('leaderboardStatus'),notice=el('leaderboardNotice'),save=el('saveScoreBtn');
    let entries=[],ticket=null,pending=null,waiting=null,generation=0,highlight=null;
    const api=async(path,body)=>{
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
        try {
            const response=await request(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
            const data=await response.json();
            if(!response.ok)throw new Error(data.error??'Shared scores could not be loaded.');
            return data;
        } catch(error) {
            if(error.name==='AbortError' || error instanceof TypeError)throw new Error('Could not connect to the shared scoreboard. Please try again.');
            throw error;
        } finally {clearTimeout(timeout);}
    };
    function render() {
        const rows=el('leaderboardRows');rows.replaceChildren();
        if(!entries.length) {
            const row=doc.createElement('tr'),cell=doc.createElement('td');cell.colSpan=3;cell.textContent='No scores yet. Be the first to haunt the top 10!';row.append(cell);rows.append(row);
        }
        entries.forEach((entry,index)=>{
            const row=doc.createElement('tr');
            if(entry.id===highlight)row.classList.add('new-high-score');
            for(const value of [index+1,entry.name,entry.score]) {
                const cell=doc.createElement('td');cell.textContent=String(value);row.append(cell);
            }
            rows.append(row);
        });
    }
    async function refresh() {
        const data=await api('/api/leaderboard');entries=data.entries;render();return entries;
    }
    async function open() {
        if(!dialog.open)dialog.showModal();
        status.textContent='Loading shared scores...';
        try{await refresh();status.textContent='Shared across all visitors. Earlier scores win ties.';if(waiting)offer();}
        catch(error){status.textContent=error.message;}
    }
    function dismiss() {pending=null;waiting=null;form.hidden=true;if(dialog.open)dialog.close();}
    function offer() {
        const result=waiting;waiting=null;
        if(!qualifies(entries,result.score)){notice.textContent=result.score>0?'Keep haunting! This score did not reach the top 10.':'Earn some fright points to enter the top 10.';return;}
        pending=result;input.value='';form.hidden=false;
        el('qualifyingScore').textContent=String(result.score);
        status.textContent='Enter your name to save your score for all visitors.';
        notice.textContent='You made the top 10! Enter your name to claim your spot.';
        if(!dialog.open)dialog.showModal();input.focus();
    }
    el('leaderboardBtn').addEventListener('click',open);
    el('closeLeaderboardBtn').addEventListener('click',dismiss);
    el('skipScoreBtn').addEventListener('click',dismiss);
    dialog.addEventListener('cancel',()=>{pending=null;waiting=null;form.hidden=true;});
    form.addEventListener('submit',async event=>{
        event.preventDefault();
        if(!pending || save.disabled)return;
        const name=playerName(input.value);
        if(!name){status.textContent='Enter a name of 1-24 characters.';input.focus();return;}
        const submission={...pending,name},run=generation;
        save.disabled=true;status.textContent='Saving your score...';
        try {
            const data=await api('/api/leaderboard',submission);
            if(run!==generation)return;
            entries=data.entries;highlight=data.entry?.id??null;render();pending=null;form.hidden=true;
            status.textContent=data.saved?'Your score is on the shared top 10!':'Another player took the last spot. Try another round!';
            notice.textContent=data.saved?'High score saved for everyone to see.':'So close! Play again to reach the top 10.';
        } catch(error){if(run===generation)status.textContent=error.message;}
        finally{save.disabled=false;}
    });
    return {
        async begin() {
            const run=++generation;ticket=null;dismiss();
            notice.textContent='Connecting to the shared scoreboard...';
            try {
                const result=await api('/api/rounds',{});
                if(run===generation){ticket=result.roundId;notice.textContent='This round can qualify for the shared top 10.';}
            } catch(error){if(run===generation)notice.textContent='Shared scores unavailable. This round is practice only.';}
        },
        async complete(score,categories) {
            const run=generation,roundId=ticket;ticket=null;
            if(!roundId){notice.textContent='Practice round complete. Shared scores were unavailable.';return;}
            waiting={roundId,score,categories:{...categories}};
            notice.textContent='Checking the shared top 10...';
            try {
                const data=await api('/api/leaderboard');
                if(run!==generation)return;
                entries=data.entries;render();
                if(waiting)offer();
            } catch(error){if(run===generation)notice.textContent='Could not check the top 10. Open Top 10 to try again.';}
        },
        cancel(){generation++;ticket=null;dismiss();notice.textContent='Finish a round to enter the shared top 10.';},
        open
    };
}
