var GUI = lil.GUI;

var fsize = 8.0;
var ffreq = 3;
var wcs = 10;
var hcs = 10;
var dcs = 10;

var container;
var camera, scene, renderer, orbit;
var originAxes;
var arrowGroup;
var xformObject;
var xformControls;

var tangentArrow;
var accelerationArrow;

var lineMaterial;
var interpolatedCurveLine;

var clock;

var time = 0;

const MatrixIdentity = (new THREE.Matrix3()).identity();

const params = {
	GizmoMode: 1,
    ShowVectorField: 0,
    ShowOriginAxes: true,
    ShowGizmo: true,
};

// there's no matrix add in three.js's Matrix3, so create one
function addMatrix3(...args)
{
    var result = new THREE.Matrix3();
    for(var i = 0; i < 9; i++)
    {
        result.elements[i] = 0;
        for (var j=0; j<args.length; j++)
        {
            result.elements[i] += args[j].elements[i];
        }
    }
    return result;
}

init();
animate();

function $(el){
	return document.getElementById(el);
}

// Adapted from https://ai.googleblog.com/2019/08/turbo-improved-rainbow-colormap-for.html
function turbo_colormap(x) {
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

// Logarithm of a rigid body transform from a quaternion and translation
// The log is returned as a matrix
// See https://www.ethaneade.com/lie.pdf section 3.2
function log(quat, translation) {
    // XYZ is imaginary vector part and W is real scalar part
    var quatVector = new THREE.Vector3(quat.x, quat.y, quat.z);
    var quatVectorMag = quatVector.length();

    var theta, A, B, C, D, axisAngle;
    if (quatVectorMag < 0.0001)
    {
        theta = 0;
        A = 1.0;
        B = 0.5;
        C = -0.5;
        // https://www.ethaneade.com/lie.pdf equation 85 has third term of (1-A/2B)/(theta*theta)
        // That is approximated by the Taylor series from
        // https://www.wolframalpha.com/input?i=series+%281+-+%28sin%28theta%29%2Ftheta%29%2F%282*%281-cos%28theta%29%29%2F%28theta*theta%29%29+%29+%2F+%28theta+*+theta%29
        D = 1/12.0;
        axisAngle = new THREE.Vector3(0,0,0);
    }
    else
    {
        theta = 2 * Math.atan2(quatVectorMag, quat.w);
        A = Math.sin(theta)/theta;
        B = (1-Math.cos(theta)) / (theta*theta);
        C = -0.5;
        D = (1-A/(2*B)) / (theta*theta);
        var quatVectorNormalized = quatVector.divideScalar(quatVectorMag);
        axisAngle = quatVectorNormalized.multiplyScalar(theta);
    }

    // hat operator (converts axis-angle vector to matrix form)
    var omegaHat = new THREE.Matrix3();
    omegaHat.set(0.0, -axisAngle.z, axisAngle.y,
                 axisAngle.z, 0.0, -axisAngle.x,
                 -axisAngle.y, axisAngle.x, 0.0);

    var logR = omegaHat.clone();
    
    // Vinv is I + omegaHat*C + omegaHat*omegaHat*D
    // from https://www.ethaneade.com/lie.pdf equation 85
    var Vinv_term0 = MatrixIdentity.clone();
    var Vinv_term1 = omegaHat.clone().multiplyScalar(C);
    var Vinv_term2 = (new THREE.Matrix3()).multiplyMatrices(omegaHat, omegaHat).multiplyScalar(D);
    var Vinv = addMatrix3(Vinv_term0, Vinv_term1, Vinv_term2);

    var u = translation.clone().applyMatrix3(Vinv);

    var logMatrix = new THREE.Matrix4();
    logMatrix.set(logR.elements[0], logR.elements[3], logR.elements[6], u.x,
                  logR.elements[1], logR.elements[4], logR.elements[7], u.y,
                  logR.elements[2], logR.elements[5], logR.elements[8], u.z,
                  0.0,               0.0,               0.0,            0.0);

    return logMatrix;
}

// This code implements a function "exp" which takes in a matrix m and a scalar value t.
// It computes the exponential map of a 3D matrix logarithm representation, and returns the result as a 4x4 matrix.
// It is assumed the matrix m is the matrix representation of the logarithm of a rigid body transform
// (such as computed with log() above).
// See https://www.ethaneade.com/lie.pdf section 3.2
function exp(m, t)
{
    // Pick out the omega (axis-angle vector) and u from the log-matrix
    var omega = new THREE.Vector3(m.elements[6], m.elements[8], m.elements[1]);
    var u = new THREE.Vector3(m.elements[12], m.elements[13], m.elements[14]);

    omega.multiplyScalar(t);
    u.multiplyScalar(t);

    // https://www.ethaneade.com/lie.pdf equations 77 - 84
    var theta = omega.length();
    var A, B, C;
    if (theta < 0.0001)
    {
        A = 1.0;
        B = 0.5;
        C = -0.5;
    }
    else
    {
        A = Math.sin(theta)/theta;
        B = (1 - Math.cos(theta))/(theta*theta);
        C = (1 - A)/(theta*theta);
    }

    var omegaHat = new THREE.Matrix3();
    omegaHat.set(0.0, -omega.z, omega.y,
                 omega.z, 0.0, -omega.x,
                 -omega.y, omega.x, 0.0);

    var R_term0 = MatrixIdentity.clone();
    var R_term1 = omegaHat.clone().multiplyScalar(A);
    var R_term2 = (new THREE.Matrix3()).multiplyMatrices(omegaHat, omegaHat).multiplyScalar(B);
    var R = addMatrix3(R_term0, R_term1, R_term2);

    var V_term0 = MatrixIdentity.clone();
    var V_term1 = omegaHat.clone().multiplyScalar(B);
    var V_term2 = (new THREE.Matrix3()).multiplyMatrices(omegaHat, omegaHat).multiplyScalar(C);
    var V = addMatrix3(V_term0, V_term1, V_term2);
    
    var Vu = u.clone().applyMatrix3(V);

    var expm = new THREE.Matrix4();
    expm.set(
        R.elements[0], R.elements[3], R.elements[6], Vu.x,
        R.elements[1], R.elements[4], R.elements[7], Vu.y,
        R.elements[2], R.elements[5], R.elements[8], Vu.z,
        0.0, 0.0, 0.0, 1.0
    );

    return expm;
}

// Multiply the point by the matrix. This assumes the point is a Vector3,
// so in homogenous coordinates, it is (x,y,z,1). This also assumes the matrix
// is a Matrix4 with a last row of (0,0,0,0) or (0,0,0,1) (we throw away the
// w component of the resulting homogenous coordinate).
function mulMatrixPoint(matrix, point)
{
    return new THREE.Vector3(
        matrix.elements[0]*point.x + matrix.elements[4]*point.y + matrix.elements[8]*point.z + matrix.elements[12],
        matrix.elements[1]*point.x + matrix.elements[5]*point.y + matrix.elements[9]*point.z + matrix.elements[13],
        matrix.elements[2]*point.x + matrix.elements[6]*point.y + matrix.elements[10]*point.z + matrix.elements[14]
    );
}

// arrow should be a THREE.ArrowHelper
function drawArrow(arrow, origin, direction)
{
    arrow.position.set(origin.x, origin.y, origin.z);
    arrow.setDirection(direction.normalize());
    var length = direction.length();
    arrow.scale.set(length, length, length);
}

function init(){
	renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('canvas') });

    var canvas = $('canvas');
    var canvasWidth = canvas.width;
    var canvasHeight = canvas.height;
	var aspectRatio = canvasWidth / canvasHeight;

	renderer.setSize( canvasWidth, canvasHeight );
	
	camera = new THREE.PerspectiveCamera(75, aspectRatio, 1, 3000);
	camera.position.set(1.59, 4.36, 9.05);

	scene = new THREE.Scene();//scene setup

	// controls = new THREE.TrackballControls(camera, $('canvas'));//sets up controls
    orbit = new THREE.OrbitControls(camera, $('canvas'));
    orbit.enableDamping = true;
    orbit.target.set(6.44, 4.04, -1.97);
    
    tangentArrow = new THREE.ArrowHelper(new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,1), 3, 0x00ff00);
    scene.add(tangentArrow);
    accelerationArrow = new THREE.ArrowHelper(new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,2), 3, 0xff0000);
    scene.add(accelerationArrow);
    
    arrowGroup = new THREE.Object3D();
    scene.add(arrowGroup);
    renderer.setClearColor(0x000000);
    
    createStuff();
    
    window.addEventListener( 'resize', onWindowResize, false );

}

function createStuff(){
    clock = new THREE.Clock();
	
	var light = new THREE.AmbientLight( 0x404040 ); // soft white light
	scene.add( light );

	originAxes = new THREE.AxesHelper( fsize );
    originAxes.scale.set(0.125,0.125,0.125);
	scene.add( originAxes )

    // We need a THREE.Object3D to attach the TransformControls to
    // So just create one that's invisible. We'll call it xformObject
    var geometry = new THREE.BoxGeometry( 1,1,1 );
    var material = new THREE.MeshBasicMaterial( {color: 0x0000ff} );
    xformObject = new THREE.Mesh( geometry, material );
    xformObject.visible = false;
    scene.add( xformObject );
    xformObject.position.set(9,4,2.5);
    xformObject.rotation.x = -Math.PI/2;
    xformObject.rotation.z = -3*Math.PI/2;

	xformControls = new THREE.TransformControls( camera, $('canvas') );
	xformControls.addEventListener( 'change', render );
	xformControls.addEventListener( 'dragging-changed', function ( event ) {
		orbit.enabled = !event.value;
	} );
    xformControls.mode = 'translate';
    xformControls.space = 'local';
    xformControls.attach( xformObject );
    
	scene.add(arrowGroup)
	createArrows();

    const lineMaterial = new THREE.LineBasicMaterial({color: 0xffffffff});
    
	scene.add( xformControls );
    
    var gui = new GUI( { autoPlace: false } );
    $('canvas-gui-container').appendChild(gui.domElement);
    
	gui.add( params, 'GizmoMode', { Rotate: 0, Translate: 1 } ).onChange( value => {
        if (value == 0) xformControls.mode = 'rotate';
        if (value == 1) xformControls.mode = 'translate';
    } );
    gui.add( params, 'ShowVectorField', { None:0, Velocity:1, Acceleration:2 });
    gui.add( params, 'ShowOriginAxes');
    gui.add( params, 'ShowGizmo');
}

function createArrows(){
    var quat = xformObject.quaternion;
    var translation = xformObject.position;
    var logMatrix = log(quat, translation);
    
    function createArrow(pos, dir){
        const len = 0.0;
        const arrowColor = new THREE.Color(1,1,1);
        const headlen = 0.0;
        var arrow = new THREE.ArrowHelper(dir, pos, len, arrowColor, headlen, headlen);
        return arrow;
    }

	arrowGroup.children = [];
	for(var x = -fsize; x <= fsize; x+=fsize/ffreq)
    {
        for(var y = -fsize; y <= fsize; y+=fsize/ffreq)
        {
    		for(var z = -fsize; z <= fsize; z+=fsize/ffreq)
            {
    			var pos = new THREE.Vector3(x,y,z);
                var dir = new THREE.Vector3(0,0,0);
        		var arrow = createArrow(pos, dir);
        		arrowGroup.add(arrow);
    		}
        }
    }
}

function updateArrows(){
    // Get the pose (transform) of the xformObject
    // This is a rigid body transform (just rotation and translation)
    // because we exposed only the rotation and translation gizmo
    // Rotation is represented as quaternion
    var quat = xformObject.quaternion;
    var translation = xformObject.position;

    // Compute the logarithm of the transform
    // Note that this is independent of time and can be computed
    // just once outside the inner loop below
    var logMatrix = log(quat, translation);

    // And the square of that, used to calculate the acceleration vector
    var logMatrixSquared = new THREE.Matrix4();
    logMatrixSquared.multiplyMatrices(logMatrix, logMatrix);
    
	for(var i = 0; i < arrowGroup.children.length; i++){
		var arrow = arrowGroup.children[i];
		var pos = arrow.position;
        
        var dir = new THREE.Vector3(0,0,0);

        if (params.ShowVectorField == 1)
            dir = mulMatrixPoint(logMatrix, pos);
        else if (params.ShowVectorField == 2)
            dir = mulMatrixPoint(logMatrixSquared, pos);

        var dirN;
        if (dir.length() > 0.0)
            dirN = dir.clone().normalize();
        else
            dirN = new THREE.Vector3(0.0, 0.0, 0.0);
		arrow.setDirection(dirN);
        
        var len = dir.length() / 15.0;

        // Use this to set arrow length proportional to velocity vector
        //arrow.setLength(len, 0.2, 0.2);
        
        // Use this to set arrow length as constant
        var constantArrowLength = fsize/ffreq/2.0;
        arrow.setLength(constantArrowLength, 0.2, 0.2);

        // Color code arrow using magnitude of velocity
        var colorlen = dir.length() / 100.0;
        var arrowColor = turbo_colormap(colorlen);
        if (dir.length() == 0.0)
        {
            // turbo_colormap() doesn't go to black, so force 0 length direction as black
            arrowColor.setRGB(0.0, 0.0, 0.0);
        }
        //arrowColor = arrowColor.convertSRGBToLinear();
        arrow.setColor(arrowColor);
	}
}

function animate(){
	requestAnimationFrame(animate);
	render();
}

function render(){
    // multiply by 0.3 so the point doesn't move too quickly
	time += clock.getDelta() * 0.3;

    if (params.ShowVectorField != 0)
	    updateArrows();

    // this is the orientation and translation of the transform of the gizmo
    // (so at time t=1)
    var quat = xformObject.quaternion;
    var translation = xformObject.position;

    // Find the log(transform) and the square of that
    var logTransform = log(quat, translation);

    var logTransformSquared = new THREE.Matrix4();
    logTransformSquared.multiplyMatrices(logTransform, logTransform);

    // the transform at time t
    var m = exp(logTransform, (time % 1.0));

    // find the point at time t (the translation of the transform at time t)
    // then, find the tagent vector and acceleration vector of that point
    var point = new THREE.Vector3(m.elements[12], m.elements[13], m.elements[14])
    var tangent = mulMatrixPoint(logTransform, point);
    var acceleration = mulMatrixPoint(logTransformSquared, point);

    // generate the points for the curve from the origin to the transform at t=1
    const curvePoints = [];
    for (var t=0.0; t<1.0; t+=0.01)
    {
        // the interpolated transform matrix at time t
        var mAtTimeT = exp(logTransform, t);
        curvePoints.push(new THREE.Vector3(mAtTimeT.elements[12], mAtTimeT.elements[13], mAtTimeT.elements[14]));
    }

    const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
    if (interpolatedCurveLine)
    {
        scene.remove(interpolatedCurveLine);
    }
    interpolatedCurveLine = new THREE.Line(curveGeometry, lineMaterial);
    scene.add(interpolatedCurveLine);

    // visualize tha tangent vector and acceleration vector
    drawArrow(tangentArrow, point, tangent);
    drawArrow(accelerationArrow, point, acceleration);

    // things toggle-able by the gui
    arrowGroup.visible = params.ShowVectorField!=0;
    originAxes.visible = params.ShowOriginAxes;
    xformControls.visible = params.ShowGizmo;
    xformControls.enabled = params.ShowGizmo;

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
