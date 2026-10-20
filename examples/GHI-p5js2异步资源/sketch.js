let picture, chime;
async function setup() { createCanvas(560,360); picture = await loadImage("assets/card.svg"); chime = await loadSound("assets/chime.wav"); image(picture,0,0,width,height); console.log("p5.js 2 local assets loaded",picture.width,chime.duration()); }
function mousePressed() { if(chime) { userStartAudio(); chime.play(); } }
