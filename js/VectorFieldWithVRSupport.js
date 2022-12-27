import { VRButton } from '/js/three.js/VRButton.js';

var GUI = lil.GUI;

var camera, scene, renderer, orbit, xform;
var mouseX, mouseY;
var t = 0;//increases each call of render
var pause = false;
var dtConstant = 10;
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

init();

function $(el){
	return document.getElementById(el);
}

function computePoints(x,y,z) {
    // TODO: this gets called before we make cube2; fix that, and then remove this guard
    if (!cube2)
        return new THREE.Vector3(0,0,0);
    
    var point = new THREE.Vector3(x,y,z);

    // XYZ is imaginary vector part and W is real scalar part
    var quat = cube2.quaternion;

    var axisAngle;
    
    var quatVector = new THREE.Vector3(quat.x, quat.y, quat.z);
    var quatVMag = quatVector.length();
    if (quatVMag < 0.0001)
    {
        axisAngle = new THREE.Vector3(0,0,0);
    }
    else
    {
        var angle = 2 * Math.atan2(quatVMag, quat.w);
        var quatVectorNormalized = quatVector.divideScalar(quatVMag);
        axisAngle = quatVectorNormalized.multiplyScalar(angle);
    }

    var matrix = new THREE.Matrix4();
    matrix.set(0.0, -axisAngle.z, axisAngle.y, 0.0,
               axisAngle.z, 0.0, -axisAngle.x, 0.0,
               -axisAngle.y, axisAngle.x, 0.0, 0.0,
               0.0, 0.0, 0.0, 1.0);
      
    point = point.applyMatrix4(matrix);
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

    var button = VRButton.createButton(renderer);
	//button.style.position = 'absolute';
	//button.style.bottom = '-100px';
	button.style.left = 'calc(50% - 75px)'; // this does nothing; but modifying the 'calc(...)' calls in VRButton.js does do something. shrug
	//button.style.width = '100px';
    $('canvas-gui-container').appendChild(button);
    renderer.xr.enabled = true;

    renderer.setAnimationLoop( function () {
	    renderer.render( scene, camera );
    });
    return;
	
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

    renderer.setAnimationLoop( function () {
        update();
	    renderer.render( scene, camera );
    });
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
	xform.addEventListener( 'change', update );
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
                var dir = computePoints(x,y,z);
                
        		var arrow = makeArrow(start, dir);
        		spriteGroup.add(arrow);
    		}
}

function updateArrows(){
	for(var i = 0; i < spriteGroup.children.length; i++){
		var arrow = spriteGroup.children[i];
		var pos = arrow.position;
		arrow.setDirection(computePoints(pos.x,pos.y,pos.z));
        var len = computePoints(pos.x,pos.y,pos.z).length() / 10.0;
        arrow.setLength(len, len*0.5, len*0.5);
        var arrowColor = new THREE.Color(len,len,len);
        arrowColor.setHSL(0.5, 0.5, len);
        arrow.setColor(arrowColor);
	}
}
var framenumber = 0;

function update(){
//	camera.lookAt(scene.position);
	
	if(!pause){
		updateGeometryVertices();
		t += dt;
		updateArrows();
	}

	//stuff you want to happen continuously here
	orbit.update();
//	renderer.render(scene, camera);
}

function updateGeometryVertices(){
	for(var vindex in cube.geometry.vertices){
		var vertex = cube.geometry.vertices[vindex];
		var offset = scene.localToWorld(vertex.clone()).add(cube.position);//this gets the vertex's position relative to the scene's origin, which is what we want
		var movementVector = computePoints(offset.x, offset.y, offset.z);
		movementVector.multiplyScalar(dt * dtConstant);//we don't want it moving too quickly
		vertex.add(movementVector);//moving the actual thing
	}
	cube.geometry.verticesNeedUpdate = true
}

// function boxGeo(height, width, hsections, wsections){//a box with only points on the border, with no points on the inside. Will save a shitton of computing time
// 	var geo = new THREE.Geometry();
// 	for(var x = -width; x <= width; x+= width / wsections)
// 		for(var y = -height; y <= height; y+= height / hsections)
// 			if(Math.abs(y) == height || Math.abs(x) == width)//if we're on a border position
// 				geo.vertices.push(new THREE.Vector3(x,y,0));
// 	return geo;
	
// }


function boxGeo(width,height, hsections, wsections){

		var a = {
			x:-width/2,
			y:-height/2
		}
		
		var b = {
			x:width/2,
			y:height/2
		}
		
		
		var geometry = new THREE.Geometry();
		
		geometry.vertices.push( new THREE.Vector3( a.x, a.y, 0));
		geometry.vertices.push( new THREE.Vector3( b.x, a.y, 0));
		geometry.vertices.push( new THREE.Vector3( b.x, b.y, 0));
		geometry.vertices.push( new THREE.Vector3( a.x, b.y, 0));

		geometry.faces.push( new THREE.Face3( 0, 1, 2 )); // counter-clockwise winding order
		geometry.faces.push( new THREE.Face3( 0, 2, 3 ));
		
		
		for(var x = -width; x <= width; x+= width / wsections)//now we'll add the little segments
			for(var y = -height; y <= height; y+= height / hsections)
				if((Math.abs(y) == height || Math.abs(x) == width) && geometry.vertices.indexOf(new THREE.Vector3(x,y,0)) == -1)//if we're on a border position
					geometry.vertices.push(new THREE.Vector3(x,y,0));
		
		// geometry.computeCentroids();
		geometry.computeFaceNormals();
		geometry.computeVertexNormals();

		return geometry
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
