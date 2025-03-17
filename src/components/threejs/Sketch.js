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
    
    svgGroups = []; // Store references to loaded SVG groups
    animatingSVGs = []; // Track which SVGs are currently being animated
    
    maxSize;
    draggingEnabled;
    collisionsEnabled;
    autoMovementEnabled; // New property to control auto movement
    
    // Eliminar los límites fijos y reemplazarlos con una función
    getSceneBounds() {
        // Calcular límites basados en la posición de la cámara y el FOV
        const fov = this.camera.fov * Math.PI / 180;
        const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
        const width = height * this.camera.aspect;
        
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        
        return {
            minX: -halfWidth,
            maxX: halfWidth,
            minY: -halfHeight,
            maxY: halfHeight,
            minZ: -5,
            maxZ: 5
        };
    }


    constructor(options, svgPaths) {
        this.container = options.domElement;
        this.width = this.container.offsetWidth;
        this.height = this.container.offsetHeight;
        this.maxSize = options.maxSize || 1;
        
        // Set options from provided options or use defaults
        this.draggingEnabled = options.draggingEnabled !== undefined ? options.draggingEnabled : true;
        this.collisionsEnabled = options.collisionsEnabled !== undefined ? options.collisionsEnabled : true;
        this.autoMovementEnabled = options.autoMovementEnabled !== undefined ? options.autoMovementEnabled : true;

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

        // Set renderer to 100% of container size
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio)
        
        // Make the canvas style take full size of container with absolute positioning
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        
        // Make sure the container has positioning context
        if (getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }
        
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
        window.addEventListener("resize", this.resize.bind(this));
        this.resize();
    }

    resize() {
        // Get the current dimensions of the container
        const newWidth = this.container.offsetWidth;
        const newHeight = this.container.offsetHeight;
        console.log(this.container);
        
        
        // Update class properties
        this.width = newWidth;
        this.height = newHeight;
        
        // Update renderer size
        this.renderer.setSize(newWidth, newHeight);
        
        // Update camera aspect ratio and projection matrix
        this.camera.aspect = newWidth / newHeight;
        this.camera.updateProjectionMatrix();
        
        // Log resizing for debugging
        console.log(`Canvas resized to: ${newWidth}x${newHeight}`);
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

                // Store reference to the SVG group and initialize velocity properties
                group.userData = { 
                    path: svgPath,
                    velocity: {
                        x: (Math.random() > 0.5 ? 0.015 : -0.015) + (Math.random() * 0.01),
                        y: (Math.random() > 0.5 ? 0.015 : -0.015) + (Math.random() * 0.01)
                    },
                };
                
                this.svgGroups.push(group);
                this.scene.add(group);
                
                // Posicionamos los SVGs en ubicaciones aleatorias dentro de los límites calculados
                const bounds = this.getSceneBounds();
                group.position.x = Math.random() * (bounds.maxX - bounds.minX - 1) + bounds.minX + 0.5;
                group.position.y = Math.random() * (bounds.maxY - bounds.minY - 1) + bounds.minY + 0.5;
                
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
        
        // Calcular límites actualizados en cada frame
        const bounds = this.getSceneBounds();

        // Only apply auto movement if enabled
        if (this.autoMovementEnabled) {
            // DVD-style bouncing animation
            this.svgGroups.forEach((group, index) => {
                // Skip animation for SVGs that aren't being animated
                if (!this.animatingSVGs.includes(group)) return;

                const velocity = group.userData.velocity;

                // Calculate new position with direct movement (no wobble)
                let newX = group.position.x + velocity.x;
                let newY = group.position.y + velocity.y;

                let hitEdge = false;
                // Check for boundary collisions and bounce using calculated bounds
                if (newX <= bounds.minX || newX >= bounds.maxX) {
                    // Reverse x direction
                    velocity.x = -velocity.x;
                    hitEdge = true;

                    // Make sure we stay within bounds
                    newX = newX <= bounds.minX ? bounds.minX : bounds.maxX;
                }

                if (newY <= bounds.minY || newY >= bounds.maxY) {
                    // Reverse y direction
                    velocity.y = -velocity.y;
                    hitEdge = true;

                    // Make sure we stay within bounds
                    newY = newY <= bounds.minY ? bounds.minY : bounds.maxY;
                }
                
                // Update position
                group.position.x = newX;
                group.position.y = newY;
                
                // DVD logo doesn't rotate, keeping it flat
                group.rotation.z = 0;
            });
        }

        // Check for collisions between SVGs only if collisions are enabled
        // Note: collisions can happen even when auto movement is disabled (e.g. during drag)
        if (this.collisionsEnabled) {
            for (let i = 0; i < this.animatingSVGs.length; i++) {
                for (let j = i + 1; j < this.animatingSVGs.length; j++) {
                    const group1 = this.animatingSVGs[i];
                    const group2 = this.animatingSVGs[j];
                    
                    if (this.checkCollision(group1, group2)) {
                        this.handleCollision(group1, group2);
                    }
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.render.bind(this));
    }

    // Check collision between two SVG groups
    checkCollision(group1, group2) {
        // Calculate bounding boxes
        const box1 = new THREE.Box3().setFromObject(group1);
        const box2 = new THREE.Box3().setFromObject(group2);
        
        // Use bounding spheres for simpler collision detection
        const center1 = box1.getCenter(new THREE.Vector3());
        const center2 = box2.getCenter(new THREE.Vector3());
        
        // Get approximate size
        const size1 = box1.getSize(new THREE.Vector3());
        const size2 = box2.getSize(new THREE.Vector3());
        
        // Calculate average radius for each SVG
        const radius1 = Math.max(size1.x, size1.y) / 2;
        const radius2 = Math.max(size2.x, size2.y) / 2;
        
        // Check distance against sum of radii
        const distance = center1.distanceTo(center2);
        return distance < (radius1 + radius2);
    }

    // Handle collision between two SVGs
    handleCollision(group1, group2) {
        // Get velocities
        const v1 = group1.userData.velocity;
        const v2 = group2.userData.velocity;
        
        // Calculate centers
        const box1 = new THREE.Box3().setFromObject(group1);
        const box2 = new THREE.Box3().setFromObject(group2);
        const center1 = box1.getCenter(new THREE.Vector3());
        const center2 = box2.getCenter(new THREE.Vector3());
        
        // Calculate collision normal
        const normal = new THREE.Vector3().subVectors(center2, center1).normalize();
        
        // Simple velocity exchange along the collision normal
        // Project velocities onto the normal
        const v1n = normal.dot(new THREE.Vector3(v1.x, v1.y, 0));
        const v2n = normal.dot(new THREE.Vector3(v2.x, v2.y, 0));
        
        // Exchange these velocity components (elastic collision)
        const v1nAfter = v2n;
        const v2nAfter = v1n;
        
        // Calculate velocity changes
        const v1nDiff = v1nAfter - v1n;
        const v2nDiff = v2nAfter - v2n;
        
        // Apply velocity changes along normal direction
        v1.x += normal.x * v1nDiff;
        v1.y += normal.y * v1nDiff;
        v2.x += normal.x * v2nDiff;
        v2.y += normal.y * v2nDiff;
        
        // Slightly separate objects to prevent sticking
        group1.position.x -= normal.x * 0.05;
        group1.position.y -= normal.y * 0.05;
        group2.position.x += normal.x * 0.05;
        group2.position.y += normal.y * 0.05;
    }

    setupInteraction() {
        // Setup raycasting for mouse interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.lastMousePosition = null;
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
            (event) => {
                // Track mouse position for velocity calculation
                this.lastMousePosition = this.mouse.clone();
                this.onMouseMove(event);
            }
        );
        this.renderer.domElement.addEventListener(
            "mouseup",
            this.onMouseUp.bind(this),
        );
    }

    onMouseDown(event) {
        // Skip if dragging is disabled
        if (!this.draggingEnabled) return;
        
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
                if (this.raycaster.ray.intersectPlane(this.plane, intersectionPoint)) {
                    this.dragOffset
                        .copy(this.selectedObject.position)
                        .sub(intersectionPoint);
                } else {
                    console.warn("Failed to intersect with plane");
                    this.dragOffset.set(0, 0, 0);
                }
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
        if (this.raycaster.ray.intersectPlane(this.plane, intersectionPoint)) {
            // Add drag offset to get potential new position
            const newPosition = intersectionPoint.clone().add(this.dragOffset);

            // Clamp position using calculated bounds
            const bounds = this.getSceneBounds();
            newPosition.x = Math.max(
                bounds.minX,
                Math.min(bounds.maxX, newPosition.x),
            );
            newPosition.y = Math.max(
                bounds.minY,
                Math.min(bounds.maxY, newPosition.y),
            );
            newPosition.z = Math.max(
                bounds.minZ,
                Math.min(bounds.maxZ, newPosition.z),
            );

            // Update the position of the selected object
            this.selectedObject.position.copy(newPosition);
        }
    }

    onMouseUp(event) {
        if (this.selectedObject) {
            // Give the object a slight velocity based on mouse movement
            // But only if auto movement is enabled
            if (this.lastMousePosition && this.autoMovementEnabled) {
                const currentMousePosition = new THREE.Vector2(this.mouse.x, this.mouse.y);
                const velocity = currentMousePosition.clone().sub(this.lastMousePosition);
                
                // Scale velocity to make movement more natural
                velocity.multiplyScalar(0.05);
                
                this.selectedObject.userData.velocity = {
                    x: velocity.x,
                    y: -velocity.y // Invert Y because screen coordinates are opposite to scene coordinates
                };
            }
            
            // Add back to animating SVGs when dragging ends
            this.animatingSVGs.push(this.selectedObject);
            console.log("Released SVG:", this.selectedObject.userData.path);
        }

        this.isDragging = false;
        this.selectedObject = null;
    }

    // Add methods to enable/disable dragging and collisions
    setDraggingEnabled(enabled) {
        this.draggingEnabled = enabled;
    }

    setCollisionsEnabled(enabled) {
        this.collisionsEnabled = enabled;
    }

    // Method to enable/disable auto movement
    setAutoMovementEnabled(enabled) {
        this.autoMovementEnabled = enabled;
        
        // If enabling auto movement, make sure all SVGs have velocity properties
        if (enabled) {
            this.svgGroups.forEach(group => {
                if (!group.userData.velocity) {
                    group.userData.velocity = {
                        x: (Math.random() > 0.5 ? 0.015 : -0.015) + (Math.random() * 0.01),
                        y: (Math.random() > 0.5 ? 0.015 : -0.015) + (Math.random() * 0.01)
                    };
                }
            });
        }
    }
}