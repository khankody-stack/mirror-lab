// All artwork uses the same unmirrored coordinates as the video; CSS mirrors both.
export function drawFilter(ctx, face, kind, width, height) {
    if (kind === 'none') return;
    const p = i => ({x: face[i].x*width, y: face[i].y*height});
    const a = p(33), b = p(263);
    const eyeDistance = Math.hypot(b.x-a.x,b.y-a.y);
    if (eyeDistance < 1) return;
    ctx.save();
    ctx.translate((a.x+b.x)/2,(a.y+b.y)/2);
    ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x));
    ctx.scale(eyeDistance, eyeDistance);
    const local = i => {
        const point=p(i), dx=(point.x-(a.x+b.x)/2)/eyeDistance, dy=(point.y-(a.y+b.y)/2)/eyeDistance;
        const angle=Math.atan2(b.y-a.y,b.x-a.x);
        return {x:dx*Math.cos(angle)+dy*Math.sin(angle), y:-dx*Math.sin(angle)+dy*Math.cos(angle)};
    };
    function ellipse(x,y,rx,ry,color) {
        ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    }
    function triangle(x,y,w,h,color) {
        ctx.beginPath();ctx.moveTo(x-w/2,y);ctx.lineTo(x+w/2,y);ctx.lineTo(x,y+h);ctx.closePath();ctx.fillStyle=color;ctx.fill();
    }
    if (kind === 'pumpkin') {
        ellipse(0,.22,.89,1.02,'rgba(229,104,22,0.72)');
        ctx.strokeStyle='#8d3d19';ctx.lineWidth=.018;
        for (const x of [-.45,0,.45]) {ctx.beginPath();ctx.ellipse(x*.35,.22,.4,1,0,-1.4,1.4);ctx.stroke();}
        ctx.fillStyle='#577a32';ctx.fillRect(-.06,-.94,.12,.23);
        triangle(-.5,-.13,.38,.28,'#261124');triangle(.5,-.13,.38,.28,'#261124');
        triangle(0,.22,.18,.2,'#261124');
        const top=local(13), bottom=local(14);
        ellipse((top.x+bottom.x)/2,(top.y+bottom.y)/2,.43,Math.max(.09,Math.abs(bottom.y-top.y)/2),'#261124');
        ctx.fillStyle='#ffcf66';
        for(const x of [-.24,0,.24]) ctx.fillRect(x-.035,top.y-.02,.07,.12);
    } else {
        for (const eye of [local(159),local(386)]) {
            if (kind === 'possessed') {
                ellipse(eye.x,eye.y,.24,.13,'rgba(32,9,45,.7)');
                ellipse(eye.x,eye.y,.17,.065,'#f4edff');
                ctx.strokeStyle='#5a246b';ctx.lineWidth=.018;
                for(const offset of [-.1,.08]) {
                    ctx.beginPath();ctx.moveTo(eye.x+offset,eye.y+.1);ctx.lineTo(eye.x+offset*.8,eye.y+.25);ctx.lineTo(eye.x+offset*1.5,eye.y+.4);ctx.stroke();
                }
            } else {
                ellipse(eye.x,eye.y,.10,.07,'#a70e31');ellipse(eye.x,eye.y,.025,.06,'#190810');
            }
        }
        if (kind === 'vampire') {
            const upper=local(13), left=local(78), right=local(308);
            const mouthWidth=Math.hypot(right.x-left.x,right.y-left.y);
            triangle(upper.x-mouthWidth*.28,upper.y,mouthWidth*.18,.22,'#fff4dc');
            triangle(upper.x+mouthWidth*.28,upper.y,mouthWidth*.18,.22,'#fff4dc');
        }
    }
    ctx.restore();
}
