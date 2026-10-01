function setup() { createCanvas(560, 360); noStroke(); }
function draw() { background(15,23,42); for(let i=0;i<24;i++){ let angle=frameCount*0.015+i*TWO_PI/24; paintDot(width/2+cos(angle)*120,height/2+sin(angle)*120,i); } }
