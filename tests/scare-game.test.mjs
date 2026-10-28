import test from 'node:test';
import assert from 'node:assert/strict';
import { ScareRound, movementScore, teethVisibility } from '../scare-game.mjs';
import { drawFilter } from '../spooky-filters.mjs';

const perfect = {mouth:1,teeth:1,motion:1,eyes:1};
function play(step, metrics=perfect) {
    const round=new ScareRound(); round.start(0);
    for(let time=0;time<=11000;time+=step) {round.tick(time);round.observe(metrics,time);}
    round.tick(11000);
    return round;
}
test('three-second countdown earns nothing and a round ends at eight seconds',()=>{
    const round=new ScareRound();round.start(100);
    round.observe(perfect,100);round.tick(3099);
    assert.equal(round.phase,'countdown');assert.equal(round.total,0);
    round.tick(3100);assert.equal(round.phase,'playing');assert.equal(round.total,0);
    round.tick(11100);assert.equal(round.phase,'finished');
});
test('sustained expressions earn equal category points independent of frame rate',()=>{
    for(const step of [20,40,100]) {
        const round=play(step);assert.equal(round.total,1000);
        assert.deepEqual(round.scores,{mouth:250,teeth:250,motion:250,eyes:250});
    }
    assert.equal(play(20,{mouth:.5,teeth:0,motion:0,eyes:.5}).total,250);
});
test('lost face, stale tracking, and long frame gaps cannot farm points',()=>{
    assert.equal(play(20,null).total,0);
    const round=new ScareRound();round.start(0);
    round.observe(perfect,3000);round.tick(3000);round.tick(11000);
    assert.ok(round.total<=28);
    const total=round.total;round.tick(99999);assert.equal(round.total,total);
});
test('a new round resets all previous results',()=>{
    const round=play(20);assert.equal(round.total,1000);
    round.start(15000);assert.equal(round.total,0);assert.equal(round.metrics,null);
    round.reset();assert.equal(round.phase,'idle');
});
test('movement ignores static poses, tracking gaps and angle wraparound',()=>{
    const pose={x:100,y:100,size:100,roll:0,yaw:0};
    assert.equal(movementScore(pose,pose,.03),0);
    assert.equal(movementScore(pose,{...pose,x:200},1),0);
    assert.ok(movementScore(pose,{...pose,roll:.12},.03)>0.5);
    assert.equal(movementScore({...pose,roll:Math.PI-.001},{...pose,roll:-Math.PI+.001},.03),0);
});
function canvasContext() {
    return new Proxy({}, {get(target,key){return target[key]??((...args)=>{
        for(const arg of args) if(typeof arg==='number') assert.ok(Number.isFinite(arg),`${key} has a finite coordinate`);
    });}});
}
const face=Array.from({length:478},(_,i)=>({x:.5+Math.sin(i)*.1,y:.5+Math.cos(i)*.1}));
face[33]={x:.3,y:.35};face[263]={x:.7,y:.35};
test('all filters draw finite geometry with a tilted, tracked face',()=>{
    for(const kind of ['none','vampire','possessed','pumpkin']) drawFilter(canvasContext(),face,kind,640,480);
    const tilted=face.map(p=>({...p,y:p.y+p.x*.2}));
    for(const kind of ['vampire','possessed','pumpkin']) drawFilter(canvasContext(),tilted,kind,640,480);
});
test('teeth estimate responds to bright neutral mouth pixels rather than red lips',()=>{
    const ctx=canvasContext();const data=new Uint8ClampedArray(48*32*4);
    ctx.getImageData=()=>({data});
    const sample={getContext:()=>ctx};const video={videoWidth:640,videoHeight:480};
    for(let i=0;i<data.length;i+=4)data.set(i<data.length/2 ? [220,210,195,255] : [35,20,20,255],i);
    assert.equal(teethVisibility(video,face,sample),1);
    for(let i=0;i<data.length;i+=4)data.set([200,65,60,255],i);
    assert.equal(teethVisibility(video,face,sample),0);
});
