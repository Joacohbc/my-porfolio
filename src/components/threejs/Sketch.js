import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

export default class Sketch {
    container;
    width;
    height;
    scene;
    camera;
    renderer;
    controls;
    time;
    meshes;
    maxSize = 1.5; // Max size for SVGs
    svgGroups = [];

    sceneBounds = {
        minX: -3,
        maxX: 3,
        minY: -3,
        maxY: 3,
        minZ: -3,
        maxZ: 3,
    };

    animatingSVGs = []; // Track which SVGs are currently being animated

    constructor(options, svgPaths) {
        this.container = options.domElement;
        this.width = this.container.offsetWidth;
        this.height = this.container.offsetHeight;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.width / this.height,
            0.1,
            1000,
        );
        this.camera.position.z = 5; // Ajustar según sea necesario.

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
        });

        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement,
        );

        // Allow 2D movement only
        this.controls.target.set(0, 0, 0); // view direction perpendicular to XY-plane
        this.controls.enableRotate = false;

        // Swap left and right mouse buttons
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ORBIT,
        };

        this.time = 0;

        this.setupResize();
        this.setLight();
        this.setupInteraction(); // Add this line to initialize interaction

        this.loadSVGs(svgPaths).then(() => {
            // Initially, all SVGs should be animated
            this.animatingSVGs = [...this.svgGroups];
            this.render();
        });
    }

    setupResize() {
        window.addEventListener("resize", () => {
            this.width = this.container.offsetWidth;
            this.height = this.container.offsetHeight;
            this.renderer.setSize(this.width, this.height);
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
        });
    }

    async loadSVGs(svgPaths) {
        const loader = new SVGLoader();

        const extrudeSettings = {
            depth: 0.15,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.02,
            bevelSegments: 3,
        };
        
        for (const svgPath of svgPaths) {
            try {
                const svgData = await loader.loadAsync(svgPath);
                const group = new THREE.Group();

                // Add identifier to the group
                group.userData = { path: svgPath };

                for (const path of svgData.paths) {
                    const material = new THREE.MeshPhongMaterial({
                        color: path.color || 0xff0055,
                        shininess: 100,
                        side: THREE.DoubleSide,
                    });

                    const shapes = SVGLoader.createShapes(path);
                    for (const shape of shapes) {
                        const geometry = new THREE.ExtrudeGeometry(
                            shape,
                            extrudeSettings,
                        );
                        const mesh = new THREE.Mesh(geometry, material);
                        group.add(mesh);
                        group.rotation.x = Math.PI; // Gira el SVG para que se vea correctamente
                    }
                }

                // --- Ajuste de tamaño y centrado ---
                const box = new THREE.Box3().setFromObject(group);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());

                // Calcula la escala para que quepa en el tamaño máximo
                const scale = Math.min(
                    this.maxSize / size.x,
                    this.maxSize / size.y,
                    this.maxSize / size.z,
                );
                group.scale.set(scale, scale, scale);

                // Centra el grupo *después* de escalarlo
                group.position.sub(center.multiplyScalar(scale));

                // Store reference to the SVG group
                this.svgGroups.push(group);
                this.scene.add(group);

                // After adding the group, initialize velocity properties
                group.userData = { 
                    path: svgPath,
                    velocity: {
                        x: (Math.random() > 0.5 ? 0.015 : -0.015) + (Math.random() * 0.01),
                        y: (Math.random() > 0.5 ? 0.015 : -0.015) + (Math.random() * 0.01)
                    },
                };
                
                this.svgGroups.push(group);
                this.scene.add(group);
            } catch (error) {
                console.error(`Error loading SVG from ${svgPath}:`, error);
            }
        }
    }

    // Add method to move a specific SVG
    moveSVG(index, x, y, z) {
        if (index >= 0 && index < this.svgGroups.length) {
            const group = this.svgGroups[index];
            group.position.x += x;
            group.position.y += y;
            group.position.z += z;
        }
    }

    // Add method to get SVG by filename
    getSVGByPath(filePath) {
        return this.svgGroups.find(
            (group) => group.userData.path === filePath,
        );
    }

    setLight() {
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);

        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);
    }

    render() {
        this.time += 0.01;

        // DVD-style bouncing animation
        this.svgGroups.forEach((group, index) => {
            // Skip animation for SVGs that aren't being animated
            if (!this.animatingSVGs.includes(group)) return;

            const velocity = group.userData.velocity;

            // Calculate new position with direct movement (no wobble)
            let newX = group.position.x + velocity.x;
            let newY = group.position.y + velocity.y;

            let hitEdge = false;
            // Check for boundary collisions and bounce
            if (newX <= this.sceneBounds.minX || newX >= this.sceneBounds.maxX) {
                // Reverse x direction
                velocity.x = -velocity.x;
                hitEdge = true;

                // Make sure we stay within bounds
                newX = newX <= this.sceneBounds.minX ? this.sceneBounds.minX : this.sceneBounds.maxX;
            }

            if (newY <= this.sceneBounds.minY || newY >= this.sceneBounds.maxY) {
                // Reverse y direction
                velocity.y = -velocity.y;
                hitEdge = true;

                // Make sure we stay within bounds
                newY = newY <= this.sceneBounds.minY ? this.sceneBounds.minY : this.sceneBounds.maxY;
            }
            
            // Update position - DVD logo always moves at constant speed
            group.position.x = newX;
            group.position.y = newY;
            
            // DVD logo doesn't rotate, keeping it flat
            group.rotation.z = 0;
        });

        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.render.bind(this));
    }

    setupInteraction() {
        // Setup raycasting for mouse interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedObject = null;
        this.dragOffset = new THREE.Vector3();
        this.isDragging = false;
        this.plane = new THREE.Plane();
        this.planeNormal = new THREE.Vector3(0, 0, 1);
        this.planePoint = new THREE.Vector3(0, 0, 0);

        // Disable OrbitControls since we'll handle interaction ourselves
        this.controls.enabled = false;

        // Mouse event listeners
        this.renderer.domElement.addEventListener(
            "mousedown",
            this.onMouseDown.bind(this),
        );
        this.renderer.domElement.addEventListener(
            "mousemove",
            this.onMouseMove.bind(this),
        );
        this.renderer.domElement.addEventListener(
            "mouseup",
            this.onMouseUp.bind(this),
        );
    }

    onMouseDown(event) {
        // Calculate mouse position in normalized device coordinates
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Find intersections with all SVG groups
        const intersects = this.raycaster.intersectObjects(
            this.svgGroups,
            true,
        );

        if (intersects.length > 0) {
            // Get the first intersected object's parent group
            let targetGroup = intersects[0].object;
            while (
                targetGroup.parent &&
                !this.svgGroups.includes(targetGroup)
            ) {
                targetGroup = targetGroup.parent;
            }

            if (this.svgGroups.includes(targetGroup)) {
                this.selectedObject = targetGroup;
                this.isDragging = true;

                // Remove from animating SVGs when dragging starts
                const index = this.animatingSVGs.indexOf(targetGroup);
                if (index > -1) {
                    this.animatingSVGs.splice(index, 1);
                }

                // Create a plane for dragging perpendicular to the camera
                this.plane.setFromNormalAndCoplanarPoint(
                    this.planeNormal,
                    this.selectedObject.position,
                );

                // Calculate offset for smooth dragging
                const intersectionPoint = new THREE.Vector3();
                this.raycaster.ray.intersectPlane(
                    this.plane,
                    intersectionPoint,
                );
                this.dragOffset
                    .copy(this.selectedObject.position)
                    .sub(intersectionPoint);
            }
        }
    }

    onMouseMove(event) {
        if (!this.isDragging || !this.selectedObject) return;

        // Calculate mouse position
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Calculate the point where the ray intersects the plane
        const intersectionPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.plane, intersectionPoint);

        // Add drag offset to get potential new position
        const newPosition = intersectionPoint.clone().add(this.dragOffset);

        // Clamp position to stay within scene boundaries
        newPosition.x = Math.max(
            this.sceneBounds.minX,
            Math.min(this.sceneBounds.maxX, newPosition.x),
        );
        newPosition.y = Math.max(
            this.sceneBounds.minY,
            Math.min(this.sceneBounds.maxY, newPosition.y),
        );
        newPosition.z = Math.max(
            this.sceneBounds.minZ,
            Math.min(this.sceneBounds.maxZ, newPosition.z),
        );

        // Update the position of the selected object
        this.selectedObject.position.copy(newPosition);
    }

    // When dragging ends, maintain the current velocity rather than resetting it
    onMouseUp() {
        if (this.selectedObject) {
            // Add back to animating SVGs when dragging ends
            this.animatingSVGs.push(this.selectedObject);
        }

        this.isDragging = false;
        this.selectedObject = null;
    }
}