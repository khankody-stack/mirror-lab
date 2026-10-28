import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as scoring from '../scare-game.mjs';
import { drawFilter } from '../spooky-filters.mjs';

test('start, countdown, scoring, replay, and stop work through the page controls', async()=>{
    const elements=new Map();let now=0, stopped=0;
    const graphics=new Proxy({getImageData:()=>({data:new Uint8ClampedArray(48*32*4)})},{get:(t,k)=>t[k]??(()=>{})});
    function element(id) {
        if(!elements.has(id)) elements.set(id,{value:id==='faceFilter'?'none':0,textContent:'',disabled:false,hidden:true,
            events:{},addEventListener(name,fn){this.events[name]=fn;},getContext:()=>graphics,
            videoWidth:640,videoHeight:480,readyState:2,currentTime:0,async play(){}});
        return elements.get(id);
    }
    const context=vm.createContext({...scoring,drawFilter,console,Float32Array,
        document:{getElementById:element,createElement:()=>({getContext:()=>graphics}),addEventListener(){}},
        window:{addEventListener(){}},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}},
        requestAnimationFrame:()=>1,cancelAnimationFrame(){},performance:{now:()=>now}});
    const source=readFileSync(new URL('../script.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('loadMediaPipe();','');
    vm.runInContext(source,context);
    const face=Array.from({length:478},(_,i)=>({x:.5+Math.sin(i)*.1,y:.5+Math.cos(i)*.1}));
    face[33]={x:.3,y:.4};face[263]={x:.7,y:.4};
    context.fakeResults={faceLandmarks:[face],faceBlendshapes:[{categories:[{categoryName:'jawOpen',score:.8}]}]};
    vm.runInContext('faceLandmarker={detectForVideo:()=>fakeResults}',context);
    await element('startBtn').events.click();
    assert.equal(vm.runInContext('round.phase',context),'countdown');
    assert.equal(element('roundOverlay').textContent,3);
    assert.equal(element('gameStart').disabled,true);
    for(now=100;now<=11000;now+=100){element('webcam').currentTime=now/1000;vm.runInContext('detectFace()',context);}
    assert.equal(vm.runInContext('round.phase',context),'finished');
    assert.equal(element('gameStart').textContent,'Play Again');
    assert.equal(element('roundOverlay').hidden,true);
    assert.ok(Number(element('totalScore').textContent)>0);
    element('gameStart').events.click();
    assert.equal(vm.runInContext('round.total',context),0);
    assert.equal(vm.runInContext('round.phase',context),'countdown');
    element('stopBtn').events.click();
    assert.equal(vm.runInContext('round.phase',context),'idle');
    assert.equal(element('gameStart').disabled,true);
    assert.equal(element('roundOverlay').hidden,true);
    assert.equal(stopped,1);
});
