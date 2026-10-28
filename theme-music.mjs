const button=document.getElementById('themeMusicBtn');
const host=document.getElementById('themePlayerHost');
const status=document.getElementById('themeMusicStatus');

// Load the official streaming player only after a deliberate click. Keep its
// video and native pause/mute/volume controls visible whenever it is loaded.
button.addEventListener('click',()=>{
    if(host.firstElementChild) {
        host.replaceChildren();host.hidden=true;
        button.textContent='Play Theme Music';button.setAttribute('aria-expanded','false');
        status.textContent='Music stopped. Use headphones with the scream meter.';
        return;
    }
    const player=document.createElement('iframe');
    player.src='https://www.youtube-nocookie.com/embed/75lCvUrdKl8?autoplay=1&controls=1&loop=1&playlist=75lCvUrdKl8&playsinline=1&rel=0';
    player.title='The Addams Family theme by Vic Mizzy - YouTube player';
    player.width='340';player.height='200';
    player.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';
    player.referrerPolicy='strict-origin-when-cross-origin';
    player.allowFullscreen=true;
    host.hidden=false;host.append(player);
    button.textContent='Stop Theme Music';button.setAttribute('aria-expanded','true');
    status.textContent='Use the player to pause or change volume. If playback is unavailable, use Listen on YouTube.';
});
