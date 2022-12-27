var GUI = lil.GUI;

var container;
var camera, scene, renderer, orbit, xform;
var t = 0;//increases each call of render
var pause = false;
var spriteGroup;
var fsize = 6;
var ffreq = 3;
var width = 0.5;
var height = 0.5;
var depth = 0.5;
var wcs = 10;
var hcs = 10;
var dcs = 10;
var cube, cube2;
var dt = 0.01;

// there's no matrix add in three.js, so create one
THREE.Matrix3.prototype.add = function(X){
    for(var i = 0; i < 9; i++)
        this.elements[i] += X.elements[i];
};

init();
animate();

function $(el){
	return document.getElementById(el);
}

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
                  0.0,               0.0,               0.0,            1.0);

    return logMatrix;
}

function getVelocity(x,y,z) {
    // TODO: this gets called before we make cube2; fix that, and then remove this guard
    if (!cube2)
        return new THREE.Vector3(0,0,0);
    
    var quat = cube2.quaternion;
    var translation = cube2.position;

    var logMatrix = log(quat, translation);
    
    var point = new THREE.Vector3(x,y,z);
    point = point.applyMatrix4(logMatrix);
    
    return point;
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

function makeArrow(pos, dir){
    var len = dir.length();
	//dir = dir.normalize();//make sure it's a unit vector
    // const arrowColor = new THREE.Color( 0xffffff );
    const arrowColor = new THREE.Color(1,1,len);
    //var arrow = new THREE.ArrowHelper(dir, pos, 0.5, arrowColor, 0.25, 0.25);
    len = len * 1000.0;
    var headlen = len * 0.5;
    //headlen = 0.25;
    var arrow = new THREE.ArrowHelper(dir, pos, len, arrowColor, headlen, headlen);
    return arrow;
}

function createStuff(){
	t = 0;
	
//	scene.children = [];

	var light = new THREE.AmbientLight( 0x404040 ); // soft white light
	scene.add( light );

	var axesHelper = new THREE.AxesHelper( 15 );
	scene.add( axesHelper )

	scene.add(spriteGroup)
	addArrows();

    var w = width;
    var h = height;
    var d = depth;
    // var sections = 10;
    var geometry = new THREE.BoxGeometry( w, h, d, wcs, hcs, dcs);//10 width and height segments, which means more shit in our geometry which means a better flow

    // tempgeo = new THREE.BoxGeometry( w, h, 0, sections, sections, 0);//100 width and height segments, which means more shit in our geometry which means a better flow
    // geometry = boxGeo(3,1,10,10).clone();
    // geometry = new THREE.Geometry();
    
    // for(var x = -w; x <= w; x+= 2*w)
    // 	for(var x = -w; x <= w; x+= 2*w)
    
    // for(var i = 0; i < geometry.vertices.length; i++){
    // 	var v = geometry.vertices[i];
    // 	if(Math.abs(v.x) == w/2 || Math.abs(v.y) == h/2)
    // 		geometry.vertices.push(v.clone());
    // 	else
    // 		console.log(v);
    // }
//    for(var i = 0; i < geometry.vertices.length(); i++){
		// var v = geometry.vertices[i];

//        	if(Math.abs(v.x) != w/2 && Math.abs(v.y) != h/2){
//        		geometry.vertices.splice(i,1);
//        		i-=1;
//        	}
//       }

    // console.log(geometry.vertices.length)
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

function addArrows(){
	spriteGroup.children = [];
	for(var x = -fsize; x <= fsize; x+=fsize/ffreq)
        for(var y = -fsize; y <= fsize; y+=fsize/ffreq)
    		for(var z = -fsize; z <= fsize; z+=fsize/ffreq){
    			var start = new THREE.Vector3(x,y,z);
                var dir = getVelocity(x,y,z);
                
        		var arrow = makeArrow(start, dir);
        		spriteGroup.add(arrow);
    		}
}

function updateArrows(){
	for(var i = 0; i < spriteGroup.children.length; i++){
		var arrow = spriteGroup.children[i];
		var pos = arrow.position;
        var dir = getVelocity(pos.x,pos.y,pos.z);
        dir = dir.normalize();
		arrow.setDirection(dir);
        var len = getVelocity(pos.x,pos.y,pos.z).length() / 10.0;
        arrow.setLength(len, len*0.5, len*0.5);
        var arrowColor = new THREE.Color(len,len,len);
        arrowColor.setHSL(0.5, 0.5, len/5.0);
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
