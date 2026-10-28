const clamp = value => Math.max(0, Math.min(1, value));
// Allow useful tracking at 2-5 FPS on CPU-bound devices, but never hold a
// missing/stalled frame indefinitely.
export const TRACKING_TIMEOUT_MS = 500;
const distance = (face, a, b, width, height) => Math.hypot((face[a].x-face[b].x)*width, (face[a].y-face[b].y)*height);

export function trackingIssue(face, width, height) {
    if (!face) return 'No face detected';
    for (const i of [33,263,133,362,1,13,14,78,308,82,87,312,317,160,144,159,145,158,153,385,380,386,374,387,373]) {
        const p = face[i];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return 'Keep your whole face in view';
    }
    return distance(face,33,263,width,height) < 32 ? 'Move closer for a clear reading' : null;
}

// Project several lip gaps perpendicular to the mouth corners. Ratios are invariant
// to image scale and head roll; jaw motion alone cannot open this meter.
export function mouthOpenness(face, width, height) {
    const a=face[78], b=face[308];
    const dx=(b.x-a.x)*width, dy=(b.y-a.y)*height, size=Math.hypot(dx,dy);
    if (size < 1) return 0;
    const gap=(top,bottom)=>Math.abs(-(face[bottom].x-face[top].x)*width*dy+(face[bottom].y-face[top].y)*height*dx)/(size*size);
    return gap(13,14)*.5 + gap(82,87)*.25 + gap(312,317)*.25;
}

export function eyeOpenness(face, width, height) {
    const eye=(pairs,left,right)=>pairs.reduce((sum,[a,b])=>sum+distance(face,a,b,width,height),0)/pairs.length/Math.max(1,distance(face,left,right,width,height));
    return {
        right: eye([[160,144],[159,145],[158,153]],33,133),
        left: eye([[385,380],[386,374],[387,373]],362,263)
    };
}

export function normalizeExpression(value, low, high) {
    return Number.isFinite(value) && high-low > 0.001 ? clamp((value-low)/(high-low)) : 0;
}

// MediaPipe matrices may include uniform scale. Normalize the three axes before
// comparing orientation; position and facial expression do not count as rotation.
export function rotationFromMatrix(matrix) {
    const data=matrix?.data;
    if (!data || data.length !== 16) return null;
    const axes=[0,4,8].map(start=>[data[start],data[start+1],data[start+2]]);
    if (axes.flat().some(value=>!Number.isFinite(value))) return null;
    for (const axis of axes) {
        const size=Math.hypot(...axis);
        if (size < 0.0001) return null;
        for(let i=0;i<3;i++) axis[i]/=size;
    }
    const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
    if (Math.abs(dot(axes[0],axes[1]))>.1 || Math.abs(dot(axes[1],axes[2]))>.1 || Math.abs(dot(axes[0],axes[2]))>.1) return null;
    return axes.flat();
}

export function facePose(face, width, height, matrix) {
    const left=face[33],right=face[263],nose=face[1];
    const dx=(right.x-left.x)*width,dy=(right.y-left.y)*height,size=Math.max(1,Math.hypot(dx,dy));
    const nx=(nose.x-(left.x+right.x)/2)*width, ny=(nose.y-(left.y+right.y)/2)*height;
    return {x:(left.x+right.x)/2*width,y:(left.y+right.y)/2*height,size,
        roll:Math.atan2(dy,dx),yaw:(nx*dx+ny*dy)/(size*size),pitch:(-nx*dy+ny*dx)/(size*size),
        rotation:rotationFromMatrix(matrix)};
}

export function movementScore(previous, current, dt) {
    if (!previous || dt<=0 || dt>TRACKING_TIMEOUT_MS/1000) return 0;
    // Tracking jumps and reacquiring a face should not earn movement points.
    if (Math.abs(Math.log(current.size/previous.size))>.3 || Math.hypot(current.x-previous.x,current.y-previous.y)/current.size>0.7) return 0;
    let angle;
    if (previous.rotation && current.rotation) {
        const trace=previous.rotation.reduce((sum,v,i)=>sum+v*current.rotation[i],0);
        angle=Math.acos(Math.max(-1,Math.min(1,(trace-1)/2)));
    } else {
        const roll=Math.atan2(Math.sin(current.roll-previous.roll),Math.cos(current.roll-previous.roll));
        angle=Math.hypot(roll,(current.yaw-previous.yaw)*1.5,((current.pitch??0)-(previous.pitch??0))*1.5);
    }
    return clamp((angle/dt-.18)/2.2);
}

export class HeadMotionTracker {
    constructor(){ this.reset(); }
    reset(){ this.history=[]; }
    update(pose, now) {
        const last=this.history.at(-1);
        const discontinuity=last && (now-last.time>TRACKING_TIMEOUT_MS || Math.abs(Math.log(pose.size/last.pose.size))>.3 || Math.hypot(pose.x-last.pose.x,pose.y-last.pose.y)/pose.size>.7);
        if (discontinuity) this.reset();
        this.history=this.history.filter(sample=>now-sample.time<=180);
        const previous=this.history.find(sample=>now-sample.time>=90)
            ?? (!discontinuity && last && now-last.time>=90 ? last : null);
        this.history.push({pose,time:now});
        return previous ? movementScore(previous.pose,pose,(now-previous.time)/1000) : 0;
    }
}

export class SignalSmoother {
    constructor(){ this.reset(); }
    reset(){ this.time=null;this.values=null; }
    update(values, now) {
        const alpha=this.time===null || now-this.time>TRACKING_TIMEOUT_MS ? 1 : 1-Math.exp(-(now-this.time)/70);
        this.values=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,this.values===null ? clamp(value) : this.values[key]+alpha*(clamp(value)-this.values[key])]));
        this.time=now;
        return {...this.values};
    }
}

// Require contrast with the mouth cavity and a connected, tooth-sized band.
// This rejects uniform skin/overexposure and isolated specular highlights.
export function teethFromPixels(pixels, width=48, height=32) {
    const luminances=[];
    for(let i=0;i<pixels.length;i+=4) if(pixels[i+3]>=230) luminances.push(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2]);
    if(luminances.length<80) return 0;
    luminances.sort((a,b)=>a-b);
    const dark=luminances[Math.floor(luminances.length*.2)],light=luminances[Math.floor(luminances.length*.9)];
    if(light-dark<25 || light<60) return 0;
    const threshold=Math.max(60,dark+(light-dark)*.55);
    const candidates=new Uint8Array(width*height);
    for(let i=0;i<candidates.length;i++) {
        const p=i*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
        const lum=.2126*r+.7152*g+.0722*b;
        if(pixels[p+3]>=230 && lum>threshold && (max-min)/Math.max(1,max)<.34 && g>r*.72 && b>r*.54) candidates[i]=1;
    }
    let teeth=0;
    for(let i=0;i<candidates.length;i++) {
        if(!candidates[i]) continue;
        const stack=[i];candidates[i]=0;
        let count=0,left=width,right=0;
        while(stack.length) {
            const p=stack.pop(),x=p%width,y=Math.floor(p/width);
            count++;left=Math.min(left,x);right=Math.max(right,x);
            for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
                if(nx<0 || nx>=width || ny<0 || ny>=height) continue;
                const n=ny*width+nx;
                if(candidates[n]) {candidates[n]=0;stack.push(n);}
            }
        }
        if(count>=luminances.length*.025 && right-left>=width*.2) teeth+=count;
    }
    return clamp(teeth/luminances.length/.32);
}

export function teethVisibility(video, face, sampleCanvas) {
    const width=video.videoWidth,height=video.videoHeight;
    const indices=[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
    const a=face[78],b=face[308],dx=(b.x-a.x)*width,dy=(b.y-a.y)*height,size=Math.hypot(dx,dy);
    if(size<18 || mouthOpenness(face,width,height)*size<3) return 0;
    const ex=dx/size,ey=dy/size;
    const local=indices.map(i=>({x:(face[i].x-a.x)*width*ex+(face[i].y-a.y)*height*ey,y:-(face[i].x-a.x)*width*ey+(face[i].y-a.y)*height*ex}));
    const left=Math.min(...local.map(p=>p.x)),top=Math.min(...local.map(p=>p.y));
    const cropWidth=Math.max(...local.map(p=>p.x))-left,cropHeight=Math.max(...local.map(p=>p.y))-top;
    if(cropHeight<3) return 0;
    const ctx=sampleCanvas.getContext('2d',{willReadFrequently:true});
    ctx.clearRect(0,0,48,32);ctx.save();ctx.beginPath();
    local.forEach((p,i)=>{const x=(p.x-left)/cropWidth*48,y=(p.y-top)/cropHeight*32;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
    ctx.closePath();ctx.clip();
    ctx.transform(48/cropWidth*ex,-32/cropHeight*ey,48/cropWidth*ey,32/cropHeight*ex,
        -48/cropWidth*(a.x*width*ex+a.y*height*ey+left),32/cropHeight*(a.x*width*ey-a.y*height*ex-top));
    ctx.drawImage(video,0,0);ctx.restore();
    return teethFromPixels(ctx.getImageData(0,0,48,32).data);
}
