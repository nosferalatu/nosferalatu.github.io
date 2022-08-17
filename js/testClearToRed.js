//
// start here
//
function testClearToRed() {
  const canvas = document.querySelector("#glCanvas");
  // Initialize the GL context
  const gl = canvas.getContext("webgl");

  // Only continue if WebGL is available and working
  if (gl === null) {
    alert("Unable to initialize WebGL. Your browser or machine may not support it.");
    return;
  }

  // Set clear color to black, fully opaque
  gl.clearColor(1.0, 0.0, 0.0, 1.0);
  // Clear the color buffer with specified clear color
  gl.clear(gl.COLOR_BUFFER_BIT);

  // look up the elements we want to affect
  var timeElement = document.querySelector("#time");
  var sliderValueElement = document.querySelector("#sliderValue");
   
  // Create text nodes to save some time for the browser
  // and avoid allocations.
  var timeNode = document.createTextNode("");
  var sliderValueNode = document.createTextNode("");
    
  // Add those text nodes where they need to go
  timeElement.appendChild(timeNode);
  sliderValueElement.appendChild(sliderValueNode);

  var sliderValue = 0;
  document.getElementById("slider").oninput = function() { sliderValue = event.srcElement.value; };
 
  requestAnimationFrame(drawScene);

  function drawScene(time) {
    var now = time * 0.001;  // convert to seconds
  
    // set the nodes
    timeNode.nodeValue = now.toFixed(2);   // 2 decimal places    
    sliderValueNode.nodeValue = Number(sliderValue).toFixed(3);  // 3 decimal places

    gl.clearColor(time/255.0/5 % 1.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    requestAnimationFrame(drawScene);
  }
}

window.onload = testClearToRed;
