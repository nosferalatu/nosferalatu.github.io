var GUI = lil.GUI;

var container;
var camera, scene, renderer, orbit, xform;
var t = 0;//increases each call of render
var pause = false;
var spriteGroup;
var fsize = 7.5;
var ffreq = 3;
var boxWidth = 0.5;
var boxHeight = 0.5;
var boxDepth = 0.5;
var wcs = 10;
var hcs = 10;
var dcs = 10;
var cube, cube2;
var dt = 0.01;

// there's no matrix add in three.js's Matrix3, so create one
THREE.Matrix3.prototype.add = function(X){
    for(var i = 0; i < 9; i++)
        this.elements[i] += X.elements[i];
};

init();
animate();

function $(el){
	return document.getElementById(el);
}

// Adapted from https://ai.googleblog.com/2019/08/turbo-improved-rainbow-colormap-for.html
function turbo_colormap(x) {
  //const kRedVec4 = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
  //const kGreenVec4 = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
  //const kBlueVec4 = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
  //const kRedVec2 = vec2(-152.94239396, 59.28637943);
  //const kGreenVec2 = vec2(4.27729857, 2.82956604);
  //const kBlueVec2 = vec2(-89.90310912, 27.34824973);

  // x = saturate(x);
  x = Math.max(x, 0.0);
  x = Math.min(x, 1.0);
    
  //vec4 v4 = vec4( 1.0, x, x * x, x * x * x);
  var v4_x = 1.0;
  var v4_y = x;  
  var v4_z = x*x;  
  var v4_w = x*x*x;
    
  //vec2 v2 = v4.zw * v4.z;
  var v2_x = v4_z * v4_z;  
  var v2_y = v4_w * v4_z;  

  var result = new THREE.Color();
  //return vec3(
  //  dot(v4, kRedVec4)   + dot(v2, kRedVec2),
  //  dot(v4, kGreenVec4) + dot(v2, kGreenVec2),
  //  dot(v4, kBlueVec4)  + dot(v2, kBlueVec2)
  //);
  result.setRGB(
      v4_x*0.13572138 + v4_y*4.61539260 + v4_z*-42.66032258 + v4_w*132.13108234 + v2_x*-152.94239396 + v2_y*59.28637943,
      v4_x*0.09140261 + v4_y*2.19418839 + v4_z*4.84296658 + v4_w*-14.18503333 + v2_x*4.27729857 + v2_y*2.82956604,
      v4_x*0.10667330 + v4_y*12.64194608 + v4_z*-60.58204836 + v4_w*110.36276771 + v2_x*-89.90310912 + v2_y*27.34824973
  );
  return result;
}

// Returns the logarithm of the quaternion+translation transformation
// (which is an element in SE(3)). The log is returned as a matrix.
function log(quat, translation) {
    // XYZ is imaginary vector part and W is real scalar part
    var quatVector = new THREE.Vector3(quat.x, quat.y, quat.z);
    var quatVMag = quatVector.length();
    var theta;
    var A;
    var B;
    var C;
    var axisAngle;
    if (quatVMag < 0.0001)
    {
        theta = 0;
        A = 1.0;
        B = 0.5;
        C = 1/6.0;
        axisAngle = new THREE.Vector3(0,0,0);
    }
    else
    {
        theta = 2 * Math.atan2(quatVMag, quat.w);
        A = Math.sin(theta)/theta;
        B = (1-Math.cos(theta)) / (theta*theta);
        C = (1-A)/(theta*theta);
        var quatVectorNormalized = quatVector.divideScalar(quatVMag);
        axisAngle = quatVectorNormalized.multiplyScalar(theta);
    }

    // hat operator (converts axis-angle vector to matrix form)
    var omegaHat = new THREE.Matrix3();
    omegaHat.set(0.0, -axisAngle.z, axisAngle.y,
                 axisAngle.z, 0.0, -axisAngle.x,
                 -axisAngle.y, axisAngle.x, 0.0);

    var logR = new THREE.Matrix3();
    logR.copy(omegaHat);
    
    // https://www.ethaneade.com/lie.pdf equation 76
    var V_term0 = new THREE.Matrix3();
    V_term0.identity();
    var V_term1 = new THREE.Matrix3();
    V_term1.copy(omegaHat);
    V_term1.multiplyScalar(B);
    var V_term2 = new THREE.Matrix3();
    V_term2.multiplyMatrices(omegaHat, omegaHat);
    V_term2.multiplyScalar(C);
    var V = new THREE.Matrix3();
    V.copy(V_term0);
    V.add(V_term1);
    V.add(V_term2);
    var V_inv = new THREE.Matrix3();
    V_inv.copy(V).invert();

    var u = new THREE.Vector3();
    u.copy(translation).applyMatrix3(V_inv);

    var logMatrix = new THREE.Matrix4();
    logMatrix.set(logR.elements[0], logR.elements[3], logR.elements[6], u.x,
                  logR.elements[1], logR.elements[4], logR.elements[7], u.y,
                  logR.elements[2], logR.elements[5], logR.elements[8], u.z,
                  0.0,               0.0,               0.0,            0.0);

    return logMatrix;
}

function mulMatrixPoint(matrix, point)
{
    return new THREE.Vector3(
        matrix.elements[0]*point.x + matrix.elements[4]*point.y + matrix.elements[8]*point.z + matrix.elements[12],
        matrix.elements[1]*point.x + matrix.elements[5]*point.y + matrix.elements[9]*point.z + matrix.elements[13],
        matrix.elements[2]*point.x + matrix.elements[6]*point.y + matrix.elements[10]*point.z + matrix.elements[14]
    );
}

function getVelocity(point) {
    // TODO: this gets called before we make cube2; fix that, and then remove this guard
    if (!cube2)
        return new THREE.Vector3(0,0,0);
    
    var quat = cube2.quaternion;
    var translation = cube2.position;

    var logMatrix = log(quat, translation);
    
    var velocity = mulMatrixPoint(logMatrix, point);
    
    return velocity;
}

function init(){
    var gui = new GUI( { autoPlace: false } );
    $('canvas-gui-container').appendChild(gui.domElement);
    
	const params = {
		TransformMode: 0,
	};
	gui.add( params, 'TransformMode', { Rotate: 0, Translate: 1 } ).onChange( value => {
        if (value == 0) xform.mode = 'rotate';
        if (value == 1) xform.mode = 'translate';
    } );
    
	renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('canvas') });

    var canvas = $('canvas');
    var canvasWidth = canvas.width;
    var canvasHeight = canvas.height;
	var aspectRatio = canvasWidth / canvasHeight;

	renderer.setSize( canvasWidth, canvasHeight );
	
	camera = new THREE.PerspectiveCamera(75, aspectRatio, 1, 3000);
	camera.position.z = 20;//sets up camera
	camera.position.y = 4;
	camera.position.x = 4;

	scene = new THREE.Scene();//scene setup

	// controls = new THREE.TrackballControls(camera, $('canvas'));//sets up controls
    orbit = new THREE.OrbitControls(camera, $('canvas'));
    orbit.enableDamping = true;

    t = 0;
	var PI2 = Math.PI * 2;//constant for 2pi

    spriteGroup = new THREE.Object3D();
    scene.add(spriteGroup);
    renderer.setClearColor(0x000000);
    
    createStuff();
    
    setInterval(function(){
    	cube2.material.color.offsetHSL(0.001,0,0);
    },10);

    window.addEventListener( 'resize', onWindowResize, false );
}

function createStuff(){
	t = 0;
	
//	scene.children = [];

	var light = new THREE.AmbientLight( 0x404040 ); // soft white light
	scene.add( light );

	var axesHelper = new THREE.AxesHelper( fsize );
	scene.add( axesHelper )

	scene.add(spriteGroup)
	addArrows();

    // var sections = 10;
    var geometry = new THREE.BoxGeometry( boxWidth, boxHeight, boxDepth, wcs, hcs, dcs);//10 width and height segments, which means more shit in our geometry which means a better flow

	var material = new THREE.MeshBasicMaterial( {color: 0x03A678} );//todo - add color to dat-gui
	cube = new THREE.Mesh( geometry, material );
	// cube.geometry.dynamic = true
	// cube.geometry.verticesNeedUpdate = true
	scene.add( cube );

    var geometry2 = new THREE.BoxGeometry( 1,1,1 );
    var material2 = new THREE.MeshBasicMaterial( {color: 0x0000ff} );
    cube2 = new THREE.Mesh( geometry2, material2 );
    scene.add( cube2 );

	xform = new THREE.TransformControls( camera, $('canvas') );
	xform.addEventListener( 'change', render );
	xform.addEventListener( 'dragging-changed', function ( event ) {
		orbit.enabled = !event.value;
	} );
    xform.mode = 'rotate';
    xform.space = 'local';
    
    xform.attach( cube2 );
	scene.add( xform );
}

function makeArrow(pos, dir){
    const len = 0.0;
    const arrowColor = new THREE.Color(1,1,1);
    const headlen = 0.0;
    var arrow = new THREE.ArrowHelper(dir, pos, len, arrowColor, headlen, headlen);
    return arrow;
}

function addArrows(){
	spriteGroup.children = [];
	for(var x = -fsize; x <= fsize; x+=fsize/ffreq)
        for(var y = -fsize; y <= fsize; y+=fsize/ffreq)
    		for(var z = -fsize; z <= fsize; z+=fsize/ffreq){
    			var pos = new THREE.Vector3(x,y,z);
                var dir = getVelocity(pos);
        		var arrow = makeArrow(pos, dir);
        		spriteGroup.add(arrow);
    		}
}

function updateArrows(){
	for(var i = 0; i < spriteGroup.children.length; i++){
		var arrow = spriteGroup.children[i];
		var pos = arrow.position;
        
        var dir = getVelocity(pos);

        var dirN = dir.clone().normalize();
		arrow.setDirection(dirN);
        
        var len = dir.length() / 15.0;

        //Arrow length is proportional to velocity vector
        //arrow.setLength(len, 0.2, 0.2);
        
        //Arrow length is constant
        var constantArrowLength = fsize/ffreq/2.0;
        arrow.setLength(constantArrowLength, 0.2, 0.2);

        // Color code arrow using magnitude of velocity
        var colorlen = dir.length() / 100.0;
        var arrowColor = turbo_colormap(colorlen);
        //arrowColor = arrowColor.convertSRGBToLinear();
        arrow.setColor(arrowColor);
	}
}

function animate(){
	requestAnimationFrame(animate);
	render();
}

function render(){
	camera.lookAt(scene.position);
	
	if(!pause){
		t += dt;
		updateArrows();
	}

	//stuff you want to happen continuously here
	orbit.update();
	renderer.render(scene, camera);
}

function onWindowResize() {
    // we need the [0] to get to this canvas here; i don't understand why, because we don't need the [0] above
    var canvas = $('canvas')[0];
    var canvasWidth = canvas.width;
    var canvasHeight = canvas.height;
	camera.aspect = canvasWidth / canvasHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(canvasWidth, canvasHeight, false);
	orbit.handleResize();
}
