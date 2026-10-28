import test from 'node:test';
import assert from 'node:assert/strict';
import { mouthOpenness, eyeOpenness, trackingIssue, normalizeExpression, rotationFromMatrix, facePose, movementScore, HeadMotionTracker, SignalSmoother, teethFromPixels } from '../face-signals.mjs';

function faceFixture(gap=.04, eyeGap=.02) {
    const face=Array.from({length:478},()=>({x:.5,y:.5}));
    const set=(i,x,y)=>face[i]={x,y};
    set(78,.4,.65);set(308,.6,.65);
    for(const [top,bottom,x] of [[13,14,.5],[82,87,.46],[312,317,.54]]) {set(top,x,.65-gap/2);set(bottom,x,.65+gap/2);}
    set(33,.35,.4);set(133,.45,.4);set(362,.55,.4);set(263,.65,.4);set(1,.5,.53);
    for(const [top,bottom,x] of [[160,144,.38],[159,145,.4],[158,153,.42],[385,380,.58],[386,374,.6],[387,373,.62]]) {
        set(top,x,.4-eyeGap/2);set(bottom,x,.4+eyeGap/2);
    }
    return face;
}
function transform(face,scale,angle) {
    return face.map(p=>{
        const x=(p.x-.5)*640*scale,y=(p.y-.5)*480*scale;
        return {x:.5+(x*Math.cos(angle)-y*Math.sin(angle))/640,y:.5+(x*Math.sin(angle)+y*Math.cos(angle))/480};
    });
}
function matrix(angle=0,scale=1,translation=0) {
    const c=Math.cos(angle)*scale,s=Math.sin(angle)*scale;
    return {data:[c,s,0,0,-s,c,0,0,0,0,scale,0,translation,translation,0,1]};
}

test('mouth and eye geometry are invariant to head roll and camera distance',()=>{
    const face=faceFixture(), mouth=mouthOpenness(face,640,480),eyes=eyeOpenness(face,640,480);
    for(const scale of [.6,1.2]) for(const angle of [-.8,.2,.8]) {
        const moved=transform(face,scale,angle);
        assert.ok(Math.abs(mouthOpenness(moved,640,480)-mouth)<1e-9);
        assert.ok(Math.abs(eyeOpenness(moved,640,480).left-eyes.left)<1e-9);
        assert.ok(Math.abs(eyeOpenness(moved,640,480).right-eyes.right)<1e-9);
    }
    assert.equal(mouthOpenness(faceFixture(0),640,480),0);
    assert.equal(eyeOpenness(faceFixture(.04,0),640,480).left,0);
});
test('personal calibration maps neutral and wide expressions to their endpoints',()=>{
    assert.equal(normalizeExpression(.3,.3,.42),0);
    assert.equal(normalizeExpression(.42,.3,.42),1);
    assert.ok(Math.abs(normalizeExpression(.36,.3,.42)-.5)<1e-9);
    assert.equal(normalizeExpression(.8,.3,.42),1);
    assert.equal(normalizeExpression(NaN,.3,.42),0);
    assert.equal(normalizeExpression(.3,.3,.3),0);
});
test('partial, invalid and distant faces are not scored',()=>{
    const face=faceFixture();assert.equal(trackingIssue(face,640,480),null);
    assert.ok(trackingIssue(undefined,640,480));
    assert.ok(trackingIssue(transform(face,.1,0),640,480));
    face[13].x=1.1;assert.ok(trackingIssue(face,640,480));
    face[13].x=NaN;assert.ok(trackingIssue(face,640,480));
});
test('matrix movement counts rotation rather than facial expressions or scale',()=>{
    const face=faceFixture();
    const base=facePose(face,640,480,matrix());
    const expression=faceFixture(.1);expression[1].x=.54;expression[1].y=.6;
    const changed=facePose(expression,640,480,matrix(0,1.2,10));
    assert.equal(movementScore(base,changed,.1),0);
    assert.ok(movementScore(base,facePose(face,640,480,matrix(.3)),.1)>.9);
    assert.equal(rotationFromMatrix({data:Array(16).fill(0)}),null);
    const jump={...base,x:base.x+500};assert.equal(movementScore(base,jump,.1),0);
});
test('movement window suppresses landmark jitter and resets on reacquisition',()=>{
    const face=faceFixture(),tracker=new HeadMotionTracker();
    for(let time=0;time<1000;time+=20) {
        const pose=facePose(face,640,480,matrix(Math.sin(time)*.002));
        assert.equal(tracker.update(pose,time),0);
    }
    assert.equal(tracker.update(facePose(face,640,480,matrix(1)),2000),0);
    assert.ok(tracker.update(facePose(face,640,480,matrix(1.3)),2100)>.9);
});
test('head movement remains measurable at low camera frame rates',()=>{
    const face=faceFixture();
    for (const step of [20,120,250,400]) {
        const tracker=new HeadMotionTracker();
        let score=0;
        for(let time=0;time<=2000;time+=step) score=tracker.update(facePose(face,640,480,matrix(time/1000*1.2)),time);
        assert.ok(Math.abs(score-(1.2-.18)/2.2)<.001,`${step}ms frame gap returned ${score}`);
    }
});
test('smoothing responds consistently across camera frame rates',()=>{
    const simulate=step=>{
        const smoother=new SignalSmoother();smoother.update({eyes:0},0);
        for(let t=step;t<=1000;t+=step)smoother.update({eyes:1},t);
        return smoother.values.eyes;
    };
    assert.ok(Math.abs(simulate(20)-simulate(100))<1e-9);
});
function mouthPixels(band=[200,190,170],shadow=[30,20,20]) {
    const pixels=new Uint8ClampedArray(48*32*4);
    for(let y=0;y<32;y++) for(let x=0;x<48;x++) pixels.set([...(y>=8 && y<20 ? band : shadow),255],(y*48+x)*4);
    return pixels;
}
test('teeth detector handles darker lighting and rejects lips, glare, and uniform skin',()=>{
    assert.ok(teethFromPixels(mouthPixels())>.9);
    assert.ok(teethFromPixels(mouthPixels([100,95,85],[15,10,10]))>.9);
    assert.equal(teethFromPixels(mouthPixels([190,65,60])),0);
    assert.equal(teethFromPixels(mouthPixels([180,160,150],[180,160,150])),0);
    assert.equal(teethFromPixels(mouthPixels([255,255,255],[255,255,255])),0);
    const spots=mouthPixels([30,20,20]);
    for(let y=2;y<30;y+=6) for(let x=2;x<46;x+=6) spots.set([255,255,255,255],(y*48+x)*4);
    assert.equal(teethFromPixels(spots),0);
});
