const FACE_OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const EYES=[
    {rim:[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],top:159,bottom:145,inner:133,outer:33,iris:468,cheek:50,sign:-1},
    {rim:[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249],top:386,bottom:374,inner:362,outer:263,iris:473,cheek:280,sign:1}
];
const INNER_MOUTH=[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
const OUTER_MOUTH=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];

// Everything is fitted to landmarks in the raw camera coordinates. The video
// and overlay share one CSS mirror transform; scoring never reads this artwork.
export function drawFilter(ctx, face, kind, width, height) {
    if(kind==='none' || !['vampire','possessed','pumpkin'].includes(kind)) return;
    const pixel=i=>({x:face[i].x*width,y:face[i].y*height});
    const a=pixel(33),b=pixel(263),size=Math.hypot(b.x-a.x,b.y-a.y);
    if(size<1) return;
    const angle=Math.atan2(b.y-a.y,b.x-a.x),cos=Math.cos(angle),sin=Math.sin(angle);
    const point=i=>{
        const p=pixel(i),x=(p.x-(a.x+b.x)/2)/size,y=(p.y-(a.y+b.y)/2)/size;
        return {x:x*cos+y*sin,y:-x*sin+y*cos};
    };
    const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
    const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    const ellipse=(p,rx,ry,fill)=>{
        if(rx<=0 || ry<=0) return;
        ctx.beginPath();ctx.ellipse(p.x,p.y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
    };
    const radial=(p,r,stops)=>{
        const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,Math.max(.001,r));
        for(const [position,color] of stops)g.addColorStop(position,color);
        return g;
    };
    const linear=(a,b,stops)=>{
        const g=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
        for(const [position,color] of stops)g.addColorStop(position,color);
        return g;
    };
    const contour=(indices,expand=1)=>{
        let points=indices.map(point);
        if(expand!==1){const c={x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length};points=points.map(p=>mix(c,p,expand));}
        ctx.beginPath();points.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.closePath();
    };
    const strokeCurve=(start,control,end,color,lineWidth)=>{
        ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.quadraticCurveTo(control.x,control.y,end.x,end.y);ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();
    };
    ctx.save();
    ctx.translate((a.x+b.x)/2,(a.y+b.y)/2);ctx.rotate(angle);ctx.scale(size,size);
    ctx.lineJoin='round';ctx.lineCap='round';
    const forehead=point(10),chin=point(152),nose=point(1);
    const oval=FACE_OVAL.map(point),minX=Math.min(...oval.map(p=>p.x)),maxX=Math.max(...oval.map(p=>p.x));
    const center=mix(forehead,chin,.5),faceWidth=Math.max(.2,maxX-minX),faceHeight=Math.max(.3,length(forehead,chin));

    // Translucent makeup retains the person's real skin texture and lighting.
    ctx.save();contour(FACE_OVAL);ctx.clip();
    if(kind==='pumpkin') {
        ctx.fillStyle=linear({x:minX,y:0},{x:maxX,y:0},[[0,'rgba(58,24,10,.8)'],[.22,'rgba(191,77,11,.65)'],[.48,'rgba(255,153,38,.62)'],[.68,'rgba(219,100,19,.68)'],[1,'rgba(48,19,8,.85)']]);
        ctx.fillRect(minX,forehead.y-.2,faceWidth,faceHeight+.4);
        // Ribs bend with the actual forehead, nose, cheeks and chin.
        for(const offset of [-.38,-.2,0,.2,.38]) {
            const start={x:forehead.x+offset*faceWidth*.65,y:forehead.y};
            const end={x:chin.x+offset*faceWidth*.45,y:chin.y};
            const control={x:nose.x+offset*faceWidth*1.3,y:center.y};
            strokeCurve(start,control,end,'rgba(66,26,7,.24)',.025);
            strokeCurve({x:start.x+.015,y:start.y},{x:control.x+.015,y:control.y},{x:end.x+.015,y:end.y},'rgba(255,200,93,.22)',.009);
        }
        // Fixed skin speckles avoid flickering random noise between frames.
        for(let i=0;i<65;i++) {
            const x=minX+((i*37)%101)/101*faceWidth,y=forehead.y+((i*61)%103)/103*faceHeight;
            ellipse({x,y},.0025+(i%3)*.001,.003,'rgba(63,30,9,.15)');
        }
    } else {
        ellipse(center,faceWidth*.65,faceHeight*.65,radial(center,faceWidth*.8,[[0,kind==='vampire'?'rgba(220,226,238,.10)':'rgba(177,194,188,.12)'],[1,'rgba(70,66,91,0)']]));
    }
    ctx.restore();

    for(const eye of EYES) {
        const top=point(eye.top),bottom=point(eye.bottom),inner=point(eye.inner),outer=point(eye.outer);
        const c=mix(inner,outer,.5),eyeWidth=length(inner,outer),opening=length(top,bottom);
        const shadow=mix(c,bottom,.65);
        // Smoky sockets fade into the skin instead of hard-edged oval stickers.
        ellipse(shadow,eyeWidth*.9,eyeWidth*.6,radial(shadow,eyeWidth*.9,[[0,'rgba(20,7,29,.35)'],[.45,'rgba(40,14,43,.17)'],[1,'rgba(30,9,38,0)']]));
        if(opening<eyeWidth*.06) continue; // Keep eyelids closed during a blink.
        ctx.save();contour(eye.rim);ctx.clip();
        if(kind==='pumpkin') {
            ctx.fillStyle=radial(c,eyeWidth*.65,[[0,'#ffb839'],[.25,'#d76814'],[.55,'#51210e'],[1,'#160d0a']]);ctx.fill();
            ellipse(c,eyeWidth*.22,opening*.35,radial(c,eyeWidth*.25,[[0,'rgba(255,236,161,.9)'],[1,'rgba(255,165,32,0)']]));
        } else if(kind==='possessed') {
            ctx.fillStyle=linear(top,bottom,[[0,'rgba(83,90,106,.9)'],[.45,'rgba(222,231,222,.94)'],[.7,'rgba(237,240,225,.94)'],[1,'rgba(108,118,120,.94)']]);ctx.fill();
            const iris=face[eye.iris] ? point(eye.iris) : c;
            ellipse(iris,eyeWidth*.17,eyeWidth*.17,radial(iris,eyeWidth*.18,[[0,'rgba(108,127,126,.25)'],[.7,'rgba(158,175,167,.12)'],[1,'rgba(200,220,206,0)']]));
            ellipse({x:c.x-eyeWidth*.12,y:c.y-opening*.12},eyeWidth*.06,opening*.08,'rgba(255,255,247,.72)');
        } else {
            const iris=face[eye.iris] ? point(eye.iris) : c;
            const radius=face[eye.iris+1] ? Math.max(.015,Math.min(eyeWidth*.25,length(iris,point(eye.iris+1)))) : eyeWidth*.19;
            ellipse(iris,radius,radius,radial(iris,radius,[[0,'#200709'],[.32,'#65121a'],[.66,'#a92d35'],[.86,'#622029'],[1,'rgba(26,12,19,.8)']]));
            for(let i=0;i<16;i++) {
                const t=i*Math.PI/8;
                const root={x:iris.x+Math.cos(t)*radius*.45,y:iris.y+Math.sin(t)*radius*.45};
                const tip={x:iris.x+Math.cos(t)*radius*.88,y:iris.y+Math.sin(t)*radius*.88};
                strokeCurve(root,mix(root,tip,.55),tip,'rgba(232,112,89,.35)',.002);
            }
            ellipse(iris,radius*.29,radius*.65,'#11080d');
            ellipse({x:iris.x-radius*.28,y:iris.y-radius*.3},radius*.17,radius*.12,'rgba(255,243,223,.8)');
        }
        ctx.restore();
        if(kind==='possessed') {
            // Fine branching capillaries bend toward a tracked cheek anchor.
            const cheek=point(eye.cheek);
            ctx.save();contour(FACE_OVAL);ctx.clip();
            for(let i=0;i<4;i++) {
                const start=mix(outer,inner,.18+i*.2);start.y=bottom.y+.01;
                const end=mix(start,cheek,.32+i*.12);end.x+=eye.sign*(i%2?.025:-.018);
                const bend=mix(start,end,.5);bend.x+=eye.sign*.025;
                strokeCurve(start,bend,end,'rgba(69,35,67,.35)',.004);
                const branch=mix(bend,end,.55);
                strokeCurve(branch,{x:branch.x+eye.sign*.035,y:branch.y+.018},{x:branch.x+eye.sign*.06,y:branch.y+.045},'rgba(79,44,75,.23)',.0025);
            }
            ctx.restore();
        }
    }

    const upper=point(13),lower=point(14),mouthWidth=length(point(78),point(308));
    const gap=length(upper,lower);
    if(kind==='vampire' && mouthWidth>.02 && gap>.012) {
        ctx.save();contour(INNER_MOUTH);ctx.clip();
        for(const index of [82,312]) {
            const root=point(index),halfWidth=mouthWidth*.07;
            const fangLength=Math.min(mouthWidth*.29,gap*.92);
            const tip={x:root.x+(index===82?.008:-.008),y:root.y+fangLength};
            ctx.beginPath();ctx.moveTo(root.x-halfWidth,root.y-.014);
            ctx.bezierCurveTo(root.x-halfWidth*.8,root.y+fangLength*.4,tip.x-halfWidth*.18,tip.y-.01,tip.x,tip.y);
            ctx.bezierCurveTo(tip.x+halfWidth*.18,tip.y-.01,root.x+halfWidth*.8,root.y+fangLength*.35,root.x+halfWidth,root.y-.014);
            ctx.closePath();ctx.fillStyle=linear({x:root.x-halfWidth,y:root.y}, {x:root.x+halfWidth,y:root.y},[[0,'#a8957d'],[.28,'#f3e6cc'],[.55,'#fff6e2'],[1,'#a99a85']]);ctx.fill();
            strokeCurve({x:root.x-halfWidth*.2,y:root.y+.015},mix(root,tip,.45),{x:tip.x,y:tip.y-.02},'rgba(255,255,241,.58)',.004);
            ellipse(root,halfWidth*1.15,.018,radial(root,halfWidth*1.3,[[0,'rgba(53,15,19,.48)'],[1,'rgba(53,15,19,0)']]));
        }
        ctx.restore();
    } else if(kind==='pumpkin' && gap>.008) {
        ctx.save();contour(OUTER_MOUTH);ctx.clip();
        ctx.fillStyle='rgba(56,22,8,.6)';ctx.fill();
        contour(INNER_MOUTH);ctx.clip();
        ctx.fillStyle=radial(mix(upper,lower,.55),mouthWidth*.6,[[0,'#ffb13a'],[.45,'#9c3b0a'],[.75,'#391606'],[1,'#160c07']]);ctx.fill();
        const toothLength=Math.min(gap*.35,mouthWidth*.13);
        for(const index of [82,13,312]) {
            const root=point(index);
            ctx.fillStyle=linear(root,{x:root.x,y:root.y+toothLength},[[0,'#9e4913'],[1,'#e69b37']]);ctx.fillRect(root.x-mouthWidth*.055,root.y-.012,mouthWidth*.11,toothLength);
        }
        ctx.restore();
    }
    ctx.restore();
}
