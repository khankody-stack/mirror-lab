import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as scoring from '../scare-game.mjs';
import {drawFilter} from '../spooky-filters.mjs';

async function simulateDevice(inferenceMs, metrics) {
    let now=0;
    const elements=new Map();
    const element=id=>{
        if(!elements.has(id)) elements.set(id,{dataset:{},value:0,textContent:'',disabled:false,
            addEventListener(){},getContext:()=>({clearRect(){}}),videoWidth:640,videoHeight:480,readyState:2,currentTime:0});
        return elements.get(id);
    };
    const context=vm.createContext({...scoring,drawFilter,console,Float32Array,createLeaderboard:()=>({async begin(){},complete(){},cancel(){}}),
        performance:{now:()=>now},document:{getElementById:element,createElement:()=>({}),addEventListener(){}},
        window:{addEventListener(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
        detector:()=>{now+=inferenceMs;return {};},metrics});
    const source=readFileSync(new URL('../script.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('loadMediaPipe();','');
    vm.runInContext(source,context);
    // Isolate frame timing from expression estimation so identical actions can be
    // compared across devices with real synchronous inference costs.
    vm.runInContext(`faceLandmarker={detectForVideo:detector};running=true;
        updateGameTracking=(_,capturedAt)=>round.observe(metrics,capturedAt);
        `,context);
    await vm.runInContext("startGame()",context);
    let frames=0;
    while(vm.runInContext('round.phase',context)!=='finished' && frames++<2000) {
        now+=16;
        element('webcam').currentTime=now/1000;
        vm.runInContext('detectFace()',context);
    }
    return vm.runInContext('({scores:round.scores,total:round.total})',context);
}

test('max mouth and head movement earn about 500 points even with slow inference',async()=>{
    for(const delay of [0,40,120,250,400]) {
        const result=await simulateDevice(delay,{mouth:1,motion:1,eyes:0,teeth:0});
        assert.ok(result.total>=490 && result.total<=500,`${delay}ms inference earned ${result.total}, expected ~500`);
    }
});
test('slow inference does not inflate neutral expressions or missing tracking',async()=>{
    assert.equal((await simulateDevice(250,{mouth:0,motion:0,eyes:0,teeth:0})).total,0);
    assert.equal((await simulateDevice(250,null)).total,0);
});
