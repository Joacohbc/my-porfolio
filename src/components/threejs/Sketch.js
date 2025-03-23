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
    maxVelocity; // Maximum velocity limit for SVGs
    draggingEnabled;
    collisionsEnabled;
    autoMovementEnabled; // New property to control auto movement
    isPaused = false; // New property to track paused state
    animationFrameId = null; // Track the animation frame request
    
    static calculateMaxSize() {
        const width = window.innerWidth;
        // Scale from 0.4 to 1 based on screen width
        if (width < 640) return 0.6; // Small mobile
        if (width < 768) return 0.7; // Mobile
        if (width < 1024) return 0.8; // Tablet
        if (width < 1280) return 0.9; // Desktop
        return 1; // Large desktop
    };

    // Remove fixed limits and replace them with a function
    getSceneBounds() {
        // Calculate limits based on the camera position and FOV
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
        this.draggingEnabled = options.draggingEnabled ?? true;
        this.collisionsEnabled = options.collisionsEnabled ?? true;
        this.autoMovementEnabled = options.autoMovementEnabled ?? true;
        this.maxVelocity = options.maxVelocity ?? 0.1; // Default max velocity

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.width / this.height,
            0.1,
            1000,
        );
        this.camera.position.z = 5; // Adjust as needed

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
            depth: .15,
            bevelEnabled: true,
            bevelThickness: .02,
            bevelSize: .02,
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
                        group.rotation.x = Math.PI; // Rotate the SVG so it appears correctly
                    }
                }

                // --- Size adjustment and centering ---
                const box = new THREE.Box3().setFromObject(group);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());

                // Calculate the scale to fit within the maximum size
                const scale = Math.min(
                    this.maxSize / size.x,
                    this.maxSize / size.y,
                    this.maxSize / size.z,
                );
                group.scale.set(scale, scale, scale);

                // Center the group *after* scaling it
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
                
                // Position the SVGs in random locations within the calculated bounds
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

    // Helper method to limit velocity to maximum allowed
    limitVelocity(velocity) {
        if (!velocity) return velocity;
        
        // Calculate current speed (magnitude of velocity vector)
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        
        // If speed exceeds maximum, scale it down
        if (speed > this.maxVelocity && speed > 0) {
            const scaleFactor = this.maxVelocity / speed;
            velocity.x *= scaleFactor;
            velocity.y *= scaleFactor;
        }
        
        return velocity;
    }

    render() {
        if (this.isPaused) return; // Skip rendering if paused
        
        this.time += 0.01;
        
        // Calculate updated bounds in each frame
        const bounds = this.getSceneBounds();

        // DVD-style bouncing animation for auto-moving objects
        // and handling of objects that are slowing down after drag
        this.svgGroups.forEach((group, index) => {
            // Skip if not being animated
            if (!this.animatingSVGs.includes(group)) return;

            const velocity = group.userData.velocity;
            if (!velocity) return;

            // Limit velocity to maximum before applying movement
            this.limitVelocity(velocity);

            // If this object is in slowing down mode and auto movement is disabled
            if (group.userData.slowingDown && !this.autoMovementEnabled) {
                // Apply gradual deceleration
                velocity.x *= 0.95; // Reduce x velocity by 5% each frame
                velocity.y *= 0.95; // Reduce y velocity by 5% each frame
                
                // If velocity is very small, stop animating this object
                if (Math.abs(velocity.x) < 0.001 && Math.abs(velocity.y) < 0.001) {
                    const index = this.animatingSVGs.indexOf(group);
                    if (index > -1) {
                        this.animatingSVGs.splice(index, 1);
                    }
                    group.userData.slowingDown = false;
                    return;
                }
            }
            
            // Store current position before moving
            const currentPosition = group.position.clone();
            
            // Apply velocity to get potential new position
            let newPosition = currentPosition.clone().add(new THREE.Vector3(velocity.x, velocity.y, 0));
            
            // Get precise bounding box at potential new position
            // First temporarily move object to new position without rendering
            const originalPosition = group.position.clone();
            group.position.copy(newPosition);
            
            // Calculate precise bounding box at new position
            const box = new THREE.Box3().setFromObject(group);
            
            // Move back to original position
            group.position.copy(originalPosition);
            
            // Get precise dimensions
            const size = box.getSize(new THREE.Vector3());
            const min = box.min;
            const max = box.max;
            
            // Check for exact pixel collision with each boundary
            let collision = false;
            
            // Left boundary collision
            if (min.x < bounds.minX) {
                // Calculate exact position to place at boundary
                newPosition.x += (bounds.minX - min.x);
                velocity.x = Math.abs(velocity.x); // Bounce right
                collision = true;
            }
            
            // Right boundary collision
            if (max.x > bounds.maxX) {
                // Calculate exact position to place at boundary
                newPosition.x -= (max.x - bounds.maxX);
                velocity.x = -Math.abs(velocity.x); // Bounce left
                collision = true;
            }
            
            // Top boundary collision
            if (min.y < bounds.minY) {
                // Calculate exact position to place at boundary
                newPosition.y += (bounds.minY - min.y);
                velocity.y = Math.abs(velocity.y); // Bounce down
                collision = true;
            }
            
            // Bottom boundary collision
            if (max.y > bounds.maxY) {
                // Calculate exact position to place at boundary
                newPosition.y -= (max.y - bounds.maxY);
                velocity.y = -Math.abs(velocity.y); // Bounce up
                collision = true;
            }
            
            // Apply final position
            group.position.copy(newPosition);
            
            // DVD logo doesn't rotate, keeping it flat
            group.rotation.z = 0;
        });

        // Only check for collisions if enabled
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
        this.animationFrameId = requestAnimationFrame(this.render.bind(this));
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
        
        // Limit velocities after collision
        this.limitVelocity(v1);
        this.limitVelocity(v2);
        
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
        this.previousMousePosition = new THREE.Vector2();
        this.selectedObject = null;
        this.dragOffset = new THREE.Vector3();
        this.isDragging = false;
        this.plane = new THREE.Plane();
        this.planeNormal = new THREE.Vector3(0, 0, 1);
        this.planePoint = new THREE.Vector3(0, 0, 0);
        
        // Mouse tracking for velocity
        this.dragStartTime = 0;
        this.lastMousePositions = [];
        this.trackingInterval = 100; // Track positions every 100ms

        // Disable OrbitControls since we'll handle interaction ourselves
        this.controls.enabled = false;

        // Mouse event listeners
        this.renderer.domElement.addEventListener("mousedown", this.onMouseDown.bind(this));
        this.renderer.domElement.addEventListener("mousemove", this.onMouseMove.bind(this));
        this.renderer.domElement.addEventListener("mouseup", this.onMouseUp.bind(this));
    }

    trackMousePosition() {
        if (!this.isDragging) return;
        
        // Store current mouse position with timestamp
        this.lastMousePositions.push({
            position: this.mouse.clone(),
            time: performance.now()
        });
        
        // Only keep the last 5 positions for better accuracy
        if (this.lastMousePositions.length > 5) {
            this.lastMousePositions.shift();
        }
        
        // Schedule next tracking
        setTimeout(() => this.trackMousePosition(), this.trackingInterval);
    }

    onMouseDown(event) {
        // Skip if dragging is disabled
        if (!this.draggingEnabled) return;
        
        // Calculate mouse position in normalized device coordinates
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Store initial position for velocity calculation
        this.previousMousePosition.copy(this.mouse);
        
        // Reset tracking arrays
        this.lastMousePositions = [];
        this.lastMousePositions.push({
            position: this.mouse.clone(),
            time: performance.now()
        });

        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Find intersections with all SVG groups
        const intersects = this.raycaster.intersectObjects(this.svgGroups, true);

        if (intersects.length > 0) {
            // Get the first intersected object's parent group
            let targetGroup = intersects[0].object;
            while (targetGroup.parent && !this.svgGroups.includes(targetGroup)) {
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
                    this.dragOffset.copy(this.selectedObject.position).sub(intersectionPoint);
                } else {
                    console.warn("Failed to intersect with plane");
                    this.dragOffset.set(0, 0, 0);
                }
                
                // Start tracking mouse movement for velocity
                this.trackMousePosition();
            }
        }
    }

    onMouseMove(event) {
        // Always update mouse position
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.previousMousePosition.copy(this.mouse);
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (!this.isDragging || !this.selectedObject) return;

        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Calculate the point where the ray intersects the plane
        const intersectionPoint = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.plane, intersectionPoint)) {
            // Add drag offset to get potential new position
            const newPosition = intersectionPoint.clone().add(this.dragOffset);

            // Clamp position using calculated bounds
            const bounds = this.getSceneBounds();
            newPosition.x = Math.max(bounds.minX, Math.min(bounds.maxX, newPosition.x));
            newPosition.y = Math.max(bounds.minY, Math.min(bounds.maxY, newPosition.y));
            newPosition.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, newPosition.z));

            // Update the position of the selected object
            this.selectedObject.position.copy(newPosition);
        }
    }

    calculateReleaseVelocity() {
        if (this.lastMousePositions.length < 2) {
            return { x: 0, y: 0 };
        }
        
        // Get last two positions
        const latest = this.lastMousePositions[this.lastMousePositions.length - 1];
        const earliest = this.lastMousePositions[0];
        
        // Calculate time difference in seconds
        const timeDiff = (latest.time - earliest.time) / 1000;
        if (timeDiff <= 0) return { x: 0, y: 0 };
        
        // Calculate velocity (change in position over time)
        const velX = (latest.position.x - earliest.position.x) / timeDiff;
        const velY = (latest.position.y - earliest.position.y) / timeDiff;
        
        // Scale the velocity for better visual behavior
        const scale = 0.03;
        
        const velocity = {
            x: velX * scale,
            y: -velY * scale  // Invert Y axis because screen coordinates are opposite to scene
        };
        
        // Apply velocity limit
        return this.limitVelocity(velocity);
    }

    onMouseUp(event) {
        if (this.selectedObject) {
            // Calculate release velocity based on recent mouse movements
            const releaseVelocity = this.calculateReleaseVelocity();
            
            console.log("Release velocity:", releaseVelocity);  // Debug log
            
            // Apply the calculated velocity
            this.selectedObject.userData.velocity = releaseVelocity;
            
            // Always add to animating SVGs
            if (!this.animatingSVGs.includes(this.selectedObject)) {
                this.animatingSVGs.push(this.selectedObject);
            }
            
            // If auto movement is off, mark for slowing down
            if (!this.autoMovementEnabled) {
                this.selectedObject.userData.slowingDown = true;
            } else {
                this.selectedObject.userData.slowingDown = false;
            }
            
            console.log("Released SVG:", this.selectedObject.userData.path);
        }

        this.isDragging = false;
        this.selectedObject = null;
        this.lastMousePositions = [];
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

    // Method to set maximum velocity
    setMaxVelocity(value) {
        if (typeof value === 'number' && value > 0) {
            this.maxVelocity = value;
            
            // Apply new limit to all existing velocities
            this.svgGroups.forEach(group => {
                if (group.userData.velocity) {
                    this.limitVelocity(group.userData.velocity);
                }
            });
            
            console.log(`Max velocity set to: ${value}`);
        } else {
            console.warn('Invalid maximum velocity value');
        }
    }
    
    // New method to pause animation and save resources
    pause() {
        if (this.isPaused) return; // Already paused
        
        this.isPaused = true;
        
        // Cancel the animation frame if one is pending
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        console.log('Animation paused to save resources');
    }
    
    // New method to resume animation
    resume() {
        if (!this.isPaused) return; // Already running
        
        this.isPaused = false;
        
        // Restart the rendering loop
        if (this.animationFrameId === null) {
            console.log('Animation resumed');
            this.render();
        }
    }
}