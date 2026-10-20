const palette = ["#4ade80", "#38bdf8", "#f472b6"];
function paintDot(x,y,i) { fill(palette[i % palette.length]); circle(x,y,16); }
