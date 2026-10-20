let picture, chime;
function preload() { picture = loadImage("assets/card.svg"); chime = loadSound("assets/chime.wav"); }
function setup() { createCanvas(560,360); image(picture,0,0,width,height); console.log("Local image and sound loaded",picture.width,chime.duration()); }
function mousePressed() { userStartAudio(); chime.play(); }
