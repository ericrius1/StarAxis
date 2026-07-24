import{$t as e,An as t,At as n,Bn as r,Bt as i,Dt as a,It as o,Kt as s,Lt as c,Nt as l,On as u,Q as d,Qt as f,R as p,S as m,Tt as h,Vn as g,Vt as _,Wt as v,Xn as y,Xt as b,Y as x,Yt as S,Zt as C,_n as w,a as T,c as ee,cn as E,d as D,dn as O,dr as k,gr as te,hr as A,i as ne,jn as re,l as ie,ln as ae,mn as oe,mr as j,n as se,o as M,r as ce,s as le,t as N,tn as P,u as ue,un as F,yn as I,zn as L}from"./MeshBVH-Bln6pDjC.js";var de=new A,R=new A,z=new A,B=new y,fe=new L,V=new A,pe=new A,me=[`x`,`y`,`z`],H=!0,U=new j,W=new j,G=new j,he=new A,ge=new A,_e=new A,ve=class extends ce{get primitiveStride(){return 3}constructor(e,t={}){if(!e.isMesh)throw Error(`SkinnedMeshBVH: First argument must be a Mesh.`);super(e.geometry,{...t,[D]:!0}),this.mesh=e,t[D]||this.init(t)}writePrimitiveBounds(e,t,n){let{mesh:r,geometry:i}=this,a=this._indirectBuffer,o=i.index?i.index.array:null,s=(a?a[e]:e)*3,c=s+0,l=s+1,u=s+2;o&&(c=o[c],l=o[l],u=o[u]),r.getVertexPosition(c,de),r.getVertexPosition(l,R),r.getVertexPosition(u,z);for(let e=0;e<3;e++){let r=me[e],i=de[r],a=R[r],o=z[r],s=i;a<s&&(s=a),o<s&&(s=o);let c=i;a>c&&(c=a),o>c&&(c=o),t[n+e]=s,t[n+e+3]=c}return t}shapecast(e){let t=new se;return super.shapecast({...e,intersectsPrimitive:e.intersectsTriangle,scratchPrimitive:t,iterate:ye})}raycastObject3D(e,t,n=[]){let{material:r}=e;if(r===void 0)return;let{matrixWorld:i}=e,{firstHitOnly:a}=t;fe.copy(i).invert(),B.copy(t.ray).applyMatrix4(fe);let o=null,s=1/0;return this.shapecast({boundsTraverseOrder:e=>e.distanceToPoint(B.origin),intersectsBounds:e=>{if(a){if(!B.intersectBox(e,pe))return 0;let n;return e.containsPoint(B.origin)?n=0:(pe.applyMatrix4(i),n=t.ray.origin.distanceTo(pe)),+(n<s)}else return+!!B.intersectsBox(e)},intersectsTriangle:(c,l)=>{let u=null;if(u=r.side===0?B.intersectTriangle(c.a,c.b,c.c,!0,V):r.side===1?B.intersectTriangle(c.c,c.b,c.a,!0,V):B.intersectTriangle(c.a,c.b,c.c,!1,V),!u)return;u=u.clone().applyMatrix4(i);let d=t.ray.origin.distanceTo(u);if(d>=t.near&&d<=t.far){if(a&&d>=s)return;let{geometry:t}=this,{index:r}=t,i=this.resolvePrimitiveIndex(l),f=i*3,p=f+0,m=f+1,h=f+2;r&&(p=r.array[p],m=r.array[m],h=r.array[h]);let g={distance:d,point:u.clone(),object:e,uv:null,uv1:null,normal:null,face:{a:p,b:m,c:h,normal:k.getNormal(c.a,c.b,c.c,new A),materialIndex:0},faceIndex:i};if(H){let e=new A;k.getBarycoord(V,c.a,c.b,c.c,e),g.barycoord=e}let _=t.attributes.uv,v=t.attributes.uv1,y=t.attributes.normal;if(_){U.fromBufferAttribute(_,p),W.fromBufferAttribute(_,m),G.fromBufferAttribute(_,h),g.uv=new j;let e=k.getInterpolation(V,c.a,c.b,c.c,U,W,G,g.uv);H||(g.uv=e)}if(v){U.fromBufferAttribute(v,p),W.fromBufferAttribute(v,m),G.fromBufferAttribute(v,h),g.uv1=new j;let e=k.getInterpolation(V,c.a,c.b,c.c,U,W,G,g.uv1);H||(g.uv1=e)}if(y){he.fromBufferAttribute(y,p),ge.fromBufferAttribute(y,m),_e.fromBufferAttribute(y,h),g.normal=new A;let e=k.getInterpolation(V,c.a,c.b,c.c,he,ge,_e,g.normal);g.normal.dot(B.direction)>0&&g.normal.multiplyScalar(-1),H||(g.normal=e)}s=g.distance,o=g,a||n.push(g)}}}),a&&o&&n.push(o),n}};function ye(e,t,n,r,i,a,o){let{mesh:s,geometry:c}=n,l=c.index?c.index.array:null;for(let c=e,u=t+e;c<u;c++){let e=n.resolvePrimitiveIndex(c),t=3*e+0,u=3*e+1,d=3*e+2;if(l&&(t=l[t],u=l[u],d=l[d]),s.getVertexPosition(t,o.a),s.getVertexPosition(u,o.b),s.getVertexPosition(d,o.c),o.needsUpdate=!0,r(o,c,i,a))return!0}return!1}var be=new g(-1,1,1,-1,0,1),xe=new class extends w{constructor(){super(),this.setAttribute(`position`,new u([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new u([0,2,0,0,2,0],2))}},Se=class{constructor(e){this._mesh=new r(xe,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,be)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},Ce=new F({min:`array<f32, 3>`,max:`array<f32, 3>`},`BVHBoundingBox`);Ce.getLength=()=>6;var we=new F({bounds:`BVHBoundingBox`,rightChildOrTriangleOffset:`uint`,splitAxisOrTriangleCount:`uint`},`BVHNode`);we.getLength=()=>Ce.getLength()+2;var Te=new F({matrixWorld:`mat4x4f`,inverseMatrixWorld:`mat4x4f`,visible:`uint`,_alignment0:`uint`,_alignment1:`uint`,_alignment2:`uint`},`TransformStruct`),K=new F({origin:`vec3f`,direction:`vec3f`},`Ray`),q=new F({indices:`vec4u`,normal:`vec3f`,didHit:`bool`,barycoord:`vec3f`,objectIndex:`uint`,side:`float`,dist:`float`},`IntersectionResult`),Ee=new F({faceIndices:`vec4u`,closestPoint:`vec3f`,found:`bool`,barycoord:`vec3f`,objectIndex:`uint`,faceNormal:`vec3f`,side:`float`,distanceSq:`float`},`PointQueryResult`),De=class extends P{static get type(){return`ProxyCallNode`}constructor(e,t){super(),this.proxyNode=e,this.params=t}setup(){return this.proxyNode.proxyNode.call(...this.params)}},Oe=class{get isNode(){return!0}get proxyNode(){let{proxyObject:e,proxyProperty:t}=this,n=t.split(`.`),r=e;for(let e=0,t=n.length;e<t;e++)r=r?.[n[e]];return r&&`functionNode`in r?r.functionNode:r??null}constructor(e,t=null){return this.proxyObject=t,this.proxyProperty=e,new Proxy(this,{get(e,t){if(t in e)return Reflect.get(e,t);{let n=e.proxyNode;if(!n)return;let r=Reflect.get(n,t);return typeof r==`function`?r.bind(n):r}},set(e,t,n){if(t in e)return Reflect.set(e,t,n);throw Error(`NodeProxy: Cannot set members of proxied nodes.`)}})}},ke=(...e)=>new Oe(...e),Ae=(...e)=>{let t=new Oe(...e);return O.nodeProxyConstructor((...e)=>new De(t,e),t)},J=new te,Y=new te;function je(e,t){let n=e?e.array:null,r=new Uint32Array(t.length*3);for(let e=0,i=t.length;e<i;e++){let i=3*e,a=3*t[e];for(let e=0;e<3;e++)r[i+e]=n?n[a+e]:a+e}return r}function Me(e,t,n,r){let i=new Uint32Array(r),a=new Float32Array(r);e._roots.forEach(e=>{let r=new Uint16Array(e),o=new Uint32Array(e);for(let s=0,c=e.byteLength/32;s<c;s++){let c=s*8,l=c*2,u=n*8,d=new Float32Array(e,s*32,6);if(s===0)for(let e=0;e<3;e++){let t=d[e+0],n=d[e+3];t>n?(a[u+e+0]=1,a[u+e+3]=-1):(a[u+e+0]=t,a[u+e+3]=n)}else a.set(d,u);if(t===null){n++;continue}if(M(l,r)){let e=o[c+6],{transformSlot:n,nodeOffset:a}=r[l+14]===0?{transformSlot:0,nodeOffset:0}:t[e];if(n>16777215)throw Error(`packBVHBufferUtils: transform slot ${n} exceeds the 24-bit TLAS leaf limit.`);i[u+6]=a,i[u+7]=4278190080|n&16777215}else i[u+6]=o[c+6],i[u+7]=o[c+7];n++}})}function Ne(e,t){return Pe(new Uint16Array(e),new Uint32Array(e),t)}function Pe(e,t,n){if(M(n*8*2,e))return 1;let r=t[n*8+6];return r+Pe(e,t,n+r)}function Fe(e,t=0){let n=new Uint16Array(e),r=new Uint32Array(e),i=0;return a(t*8,1),i;function a(e,t){let o=e;if(M(e*2,n))i=Math.max(t,i);else{let e=ee(o,r);a(le(o),t+1),a(e,t+1)}}}function Ie(e,t,n,r,i,a){let o=new Uint16Array(a),s=new Uint32Array(a),c=new Float32Array(a),l=new Uint16Array(e),u=new Uint32Array(e);for(let a=0;a<n;a++){let n=t+a,d=n*8,f=d*2,p=i*8,m=p*2,h=new Float32Array(e,n*32,6);if(a===0)for(let e=0;e<3;e++){let t=h[e+0],n=h[e+3];t>n?(c[p+e+0]=1,c[p+e+3]=-1):(c[p+e+0]=t,c[p+e+3]=n)}else c.set(h,p);M(f,l)?(s[p+6]=u[d+6]+r,o[m+14]=l[f+14],o[m+15]=ue):(s[p+6]=u[d+6],s[p+7]=u[d+7]),i++}}function Le(e,t,n,r,i){let{geometry:a}=e,{start:o,count:s,vertexStart:c}=t;if(e.indirect){let t=je(a.index,e._indirectBuffer);for(let e=0;e<t.length;e++)i[e+r]=t[e]-c+n}else if(a.index)for(let e=0;e<s;e++)i[e+r]=a.index.getX(e+o)-c+n;else for(let e=0;e<s;e++)i[e+r]=e+o+n}function Re(e,t,n,r,i,a){let{geometry:o,mesh:s=null}=e,{vertexStart:c,vertexCount:l}=t,u=new Float32Array(r),d=i.getLength();i.membersLayout.forEach(({name:e},t)=>{let r=o.attributes[e];a.getDefaultAttributeValue(e,J);for(let i=0;i<l;i++){if(r){switch(Y.fromBufferAttribute(r,i+c),r.itemSize){case 1:Y.y=J.y,Y.z=J.z,Y.w=J.w;break;case 2:Y.z=J.z,Y.w=J.w;break;case 3:Y.w=J.w;break}s&&(e===`position`||e===`normal`||e===`tangent`)&&s.applyBoneTransform(i+c,Y)}else Y.copy(J);Y.toArray(u,(n+i)*d+t*4)}})}var ze=class extends P{constructor(e){super(),this.literal=e}build(){return this.literal}},Be=class extends P{constructor(e,t=`property`){super(),this.node=e,this.output=t}build(e){return this.node.build(e,this.output)}};function Ve(e){return e.isNode?new Be(e):null}function He(e){let t=[];for(let n of e)if(Array.isArray(n))for(let e of n){let n=Ve(e);n&&t.push(n)}return t}function Ue(e,t){return e.map(e=>(e&&!e.isNode&&e instanceof Function&&(e=e(t)),e&&e.isNode?(e.setup(t),e.isWGSLTagCodeNode?new Be(e,`inline`):new Be(e)):e))}function We(e,t,n){let r=``;for(let i=0,a=e.length;i<a;i++)if(r+=e[i],i<t.length){let e=t[i];Array.isArray(e)||(typeof e==`string`||typeof e==`number`?r+=String(e):r+=e.build(n))}return r}var Ge=class extends f{static get type(){return`WGSLTagFnNode`}constructor(e,t,n=`wgsl`){super(``,He(t),n),this.isWGSLTagFnNode=!0,this.tokens=e,this.args=t}setup(e){super.setup(e),this._normalizedArgs=Ue(this.args,e)}getNodeFunction(e){let{tokens:t,_normalizedArgs:n}=this,r=e.getDataFromNode(this),i=r.nodeFunction;if(i===void 0){let a=``;for(let r=0,i=t.length;r<i;r++)if(a+=t[r],r<n.length){let t=n[r];Array.isArray(t)||(typeof t==`string`||typeof t==`number`?a+=String(t):t.isStructLayoutNode?a+=t.getNodeType(e):t.isStruct?a+=t.layout.getNodeType(e):a+=`_arg`+r)}a=a.replace(/\/\/.+[\n\r]/g,``),i=e.parser.parseFunction(a),r.nodeFunction=i}return i}generate(e,t){let n=super.generate(e,t),{_normalizedArgs:r}=this,i=We(this.tokens,r,e),{type:a}=this.getNodeFunction(e),o=e.getCodeFromNode(this,a);return o.code=i.replace(/\/\/.+[\n\r]/g,``).replace(/->\s*void/,``).trim(),n}},Ke=class extends C{static get type(){return`WGSLTagCodeNode`}constructor(e,t,n=`wgsl`){super(``,He(t),n),this.isWGSLTagCodeNode=!0,this.tokens=e,this.args=t}setup(e){super.setup(e),this._normalizedArgs=Ue(this.args,e)}build(e,t){return t===`inline`?We(this.tokens,this._normalizedArgs,e):super.build(e,t)}generate(e){super.generate(e);let t=e.getCodeFromNode(this,this.getNodeType(e));return t.code=We(this.tokens,this._normalizedArgs,e),t.code}},qe=e=>O.nodeProxyConstructor((...t)=>{if(t.length===1&&t[0]&&typeof t[0]==`object`&&!t[0].isNode){let e=t[0];for(let t in e)typeof e[t]==`string`&&(e[t]=new ze(e[t]))}return e.call(...t)},e),X=(e,...t)=>qe(new Ge(e,t)),Z=(e,...t)=>new Ke(e,t),Je=o(60);function Ye(e,t){let{name:n=`bvh_shapecast_fn_${Math.random().toString(36).substring(2,7)}`,shapeStruct:r,resultStruct:i=null,prefixFn:a=null,boundsOrderFn:o=null,intersectsBoundsFn:s,intersectRangeFn:c,transformShapeFn:l=null,transformResultFn:u=null,resetShapeFn:d=null}=t,{nodes:f,transforms:p}=e.storage,m=``;a&&(m=Z`${a}();`);let h=``;u&&(h=Z`${u}( result, objectIndex );`);let g=``;l&&(g=Z`${l}( &localShape, objectIndex );`);let _=``;d&&(_=Z`${d}( objectIndex );`);let v=``;o&&(v=Z`
			let leftToRight = ${o}( localShape, splitAxis, node );
			c1 = select( rightIndex, leftIndex, leftToRight );
			c2 = select( leftIndex, rightIndex, leftToRight );
		`);let y=i?Z`result: ptr<function, ${i}>`:``,b=i?`result`:``,x=X`
		// fn
		fn ${n}( shape: ${r}, ${y} ) -> bool {

			${m}

			var didHit = false;

			var isTLAS = true;
			var pointer: i32 = 0;
			var stack: array<u32, ${Je}>;
			stack[ 0 ] = 0u;

			var blasDidHit: bool = false;
			var objectIndex: u32 = 0;
			var localShape: ${r} = shape;

			// the stack depth the current cluster's BLAS drains back down to once it is complete
			var tlasReset: i32 = 0;

			loop {

				// The cluster's BLAS has drained back to its TLAS leaf. Finalize the cluster that
				// was just traversed and resume the TLAS.
				if ( ! isTLAS && tlasReset == pointer ) {

					if ( blasDidHit ) {

						blasDidHit = false;
						didHit = true;
						${h}

					}

					${_}

					objectIndex = 0;
					isTLAS = true;
					localShape = shape;

				}

				// check if we've finished all nodes on the stack (or overrun the stack)
				if ( pointer < 0 || pointer >= i32( ${Je} ) ) {

					break;

				}

				let nodeIndex = stack[ pointer ];
				let node = ${f}[ nodeIndex ];
				pointer = pointer - 1;

				// skip the node if we don't intersect the bounds
				if ( ${s}( localShape, node.bounds, ${b} ) == 0u ) {

					continue;

				}

				let infoX = node.splitAxisOrTriangleCount;
				let infoY = node.rightChildOrTriangleOffset;
				let isLeaf = ( infoX & 0xffff0000u ) != 0u;

				if ( isLeaf ) {

					if ( isTLAS ) {

						// the leaf encodes the placement / transform slot in the low 24 bits of infoX
						// and the cluster subtree's absolute node offset in infoY, which is pushed
						// directly as the BLAS entry node. Each TLAS leaf references one cluster.
						objectIndex = infoX & 0x00ffffffu;

						let transform = ${p}[ objectIndex ];
						if ( transform.visible != 0u ) {

							tlasReset = pointer;
							isTLAS = false;
							blasDidHit = false;

							// Transform shape into object local space
							localShape = shape;
							${g}

							pointer = pointer + 1;
							stack[ pointer ] = infoY;

						}

					} else {

						let count = infoX & 0x0000ffffu;
						let offset = infoY;
						blasDidHit = ${c}( localShape, offset, count, ${b} ) || blasDidHit;

					}

				} else {

					let leftIndex = nodeIndex + 1u;
					let splitAxis = infoX & 0x0000ffffu;
					let rightIndex = nodeIndex + infoY;

					var c1 = rightIndex;
					var c2 = leftIndex;
					${v}

					pointer = pointer + 1;
					stack[ pointer ] = c2;

					pointer = pointer + 1;
					stack[ pointer ] = c1;

				}

			}

			return didHit;

		}
	`;return x.outputType=i,x.functionName=n,x}var Xe=X`
	// fn
	fn closestPointToTriangle(
		p: vec3f,
		v0: vec3f,
		v1: vec3f,
		v2: vec3f
	) -> vec3f {

		let v10 = v1 - v0;
		let v21 = v2 - v1;
		let v02 = v0 - v2;
		let p0 = p - v0;
		let p1 = p - v1;
		let p2 = p - v2;

		let nor = cross( v10, v02 );
		let q = cross( nor, p0 );
		let d = 1.0 / dot( nor, nor );
		var u = d * dot( q, v02 );
		var v = d * dot( q, v10 );
		var w = 1.0 - u - v;

		if ( u < 0.0 ) {

			w = clamp( dot( p2, v02 ) / dot( v02, v02 ), 0.0, 1.0 );
			u = 0.0;
			v = 1.0 - w;

		} else if ( v < 0.0 ) {

			u = clamp( dot( p0, v10 ) / dot( v10, v10 ), 0.0, 1.0 );
			v = 0.0;
			w = 1.0 - u;

		} else if ( w < 0.0 ) {

			v = clamp( dot( p1, v21 ) / dot( v21, v21 ), 0.0, 1.0 );
			w = 0.0;
			u = 1.0 - v;

		}

		return vec3f( w, u, v );

	}
`,Ze=X`
	// fn
	fn intersectRayTriangle( ray: ${K}, a: vec3f, b: vec3f, c: vec3f, threshold: f32 ) -> ${q} {

		const DET_EPSILON = 1e-15;

		var result: ${q};
		result.didHit = false;

		let edge1 = b - a;
		let edge2 = c - a;
		let n = cross( edge1, edge2 );

		let det = - dot( ray.direction, n );
		if ( abs( det ) < DET_EPSILON ) {

			return result;

		}

		let invdet = 1.0 / det;

		let AO = ray.origin - a;
		let DAO = cross( AO, ray.direction );

		let u = dot( edge2, DAO ) * invdet;
		if ( u < 0.0 || u > 1.0 ) {

			return result;

		}

		let v = - dot( edge1, DAO ) * invdet;
		if ( v < 0.0 || u + v > 1.0 ) {

			return result;

		}

		let t = dot( AO, n ) * invdet;
		let w = 1.0 - u - v;
		if ( t < threshold ) {

			return result;

		}

		result.didHit = true;
		result.barycoord = vec3f( w, u, v );
		result.dist = t;
		result.side = sign( det );
		result.normal = result.side * normalize( n );

		return result;

	}
`,Qe=X`
	// fn
	fn ndcToCameraRay( ndc: vec2f, inverseModelViewProjection: mat4x4f ) -> ${K} {

		var homogeneous = vec4f();
		var ray: ${K};

		homogeneous = inverseModelViewProjection * vec4f( ndc, 0.0, 1.0 );
		ray.origin = homogeneous.xyz / homogeneous.w;

		homogeneous = inverseModelViewProjection * vec4f( ndc, 1.0, 1.0 );
		ray.direction = ( homogeneous.xyz / homogeneous.w ) - ray.origin;

		return ray;

	}
`;function $e(e){let{index:t,attributes:n,transforms:r}=e.storage,i=p(1).toVar(`bvh_rayScalar_${Math.random().toString(36).substring(2,7)}`);return e.getShapecastFn({name:`bvh_RaycastFirstHit`,shapeStruct:K,resultStruct:q,boundsOrderFn:X`
			fn getBoundsOrder( ray: ${K}, splitAxis: u32, node: ${we} ) -> bool {

				return ray.direction[ splitAxis ] >= 0.0;

			}
		`,intersectsBoundsFn:X`
			fn rayIntersectsBounds( ray: ${K}, bounds: ${Ce}, result: ptr<function, ${q}> ) -> u32 {

				let boundsMin = vec3( bounds.min[0], bounds.min[1], bounds.min[2] );
				let boundsMax = vec3( bounds.max[0], bounds.max[1], bounds.max[2] );

				let invDir = 1.0 / ray.direction;
				let tMinPlane = ( boundsMin - ray.origin ) * invDir;
				let tMaxPlane = ( boundsMax - ray.origin ) * invDir;

				let tMinHit = vec3f(
					min( tMinPlane.x, tMaxPlane.x ),
					min( tMinPlane.y, tMaxPlane.y ),
					min( tMinPlane.z, tMaxPlane.z )
				);

				let tMaxHit = vec3f(
					max( tMinPlane.x, tMaxPlane.x ),
					max( tMinPlane.y, tMaxPlane.y ),
					max( tMinPlane.z, tMaxPlane.z )
				);

				let t0 = max( max( tMinHit.x, tMinHit.y ), tMinHit.z );
				let t1 = min( min( tMaxHit.x, tMaxHit.y ), tMaxHit.z );

				let dist = max( t0, 0.0 );
				if ( t1 < dist ) {

					return 0u;

				} else if ( result.didHit && dist * ${i} >= result.dist ) {

					return 0u;

				} else {

					return 1u;

				}

			}

		`,intersectRangeFn:X`
			fn intersectRange( ray: ${K}, offset: u32, count: u32, result: ptr<function, ${q}> ) -> bool {

				var didHit = false;
				for ( var ti = offset; ti < offset + count; ti = ti + 1u ) {

					let i0 = ${t}[ ti * 3u ];
					let i1 = ${t}[ ti * 3u + 1u ];
					let i2 = ${t}[ ti * 3u + 2u ];

					let a = ${n}[ i0 ].position.xyz;
					let b = ${n}[ i1 ].position.xyz;
					let c = ${n}[ i2 ].position.xyz;

					var triResult = ${Ze}( ray, a, b, c, 0.0 );
					triResult.dist *= ${i};
					if ( triResult.didHit && ( ! result.didHit || triResult.dist < result.dist ) ) {

						result.didHit = true;
						result.dist = triResult.dist;
						result.normal = triResult.normal;
						result.side = triResult.side;
						result.barycoord = triResult.barycoord;
						result.indices = vec4u( i0, i1, i2, ti );

						didHit = true;

					}

				}

				return didHit;

			}
		`,transformShapeFn:X`
			fn transformRay( ray: ptr<function, ${K}>, objectIndex: u32 ) -> void {

				let toLocal = ${r}[ objectIndex ].inverseMatrixWorld;
				ray.origin = ( toLocal * vec4f( ray.origin, 1.0 ) ).xyz;
				ray.direction = ( toLocal * vec4f( ray.direction, 0.0 ) ).xyz;

				let len = length( ray.direction );
				ray.direction /= len;
				${i} = 1.0 / len;

			}
		`,transformResultFn:X`
			fn transformResult( hit: ptr<function, ${q}>, objectIndex: u32 ) -> void {

				let toLocal = ${r}[ objectIndex ].inverseMatrixWorld;
				hit.normal = normalize( ( transpose( toLocal ) * vec4f( hit.normal, 0.0 ) ).xyz );
				hit.objectIndex = objectIndex;

			}
		`,resetShapeFn:X`
			fn resetRayScalar( objectIndex: u32 ) -> void {

				${i} = 1.0;

			}
		`})}function et(e){let{storage:t,structs:n}=e,r=n.attributes.membersLayout.map(({name:e})=>`result.${e} = a0.${e} * barycoord.x + a1.${e} * barycoord.y + a2.${e} * barycoord.z;`).join(`
`);return X`
		// fn
		fn bvh_sampleTrianglePoint( barycoord: vec3f, indices: vec3u ) -> ${n.attributes} {

			var result: ${n.attributes};
			var a0 = ${t.attributes}[ indices.x ];
			var a1 = ${t.attributes}[ indices.y ];
			var a2 = ${t.attributes}[ indices.z ];
			${r}
			return result;

		}
	`}function tt(e){let{index:t,attributes:n,transforms:r}=e.storage,i=d().toVar(`bvh_toWorldMat`);return e.getShapecastFn({name:`bvh_ClosestPointToPoint`,shapeStruct:`vec3f`,resultStruct:Ee,boundsOrderFn:X`
			fn cppBoundsOrder( shape: vec3f, splitAxis: u32, node: ${we} ) -> bool {

				let toWorld = ${i};

				// get center
				let bMin = vec3f( node.bounds.min[ 0 ], node.bounds.min[ 1 ], node.bounds.min[ 2 ] );
				let bMax = vec3f( node.bounds.max[ 0 ], node.bounds.max[ 1 ], node.bounds.max[ 2 ] );
				let center = bMin * 0.5 + bMax * 0.5;

				// determine the order in world space
				let worldCenter = ( toWorld * vec4f( center, 1.0 ) ).xyz;
				let worldAxis = normalize( toWorld[ splitAxis ].xyz );
				return dot( shape - worldCenter, worldAxis ) <= 0.0;

			}
		`,intersectsBoundsFn:X`
			fn cppIntersectsBounds( shape: vec3f, bounds: ${Ce}, result: ptr<function, ${Ee}> ) -> u32 {

				// return 1u;
				// we need to check this no matter what if the result has not been found yet
				if ( ! result.found ) {

					return 1u;

				}

				let toWorld = ${i};

				// transform to world space
				let bMin = vec3f( bounds.min[ 0 ], bounds.min[ 1 ], bounds.min[ 2 ] );
				let bMax = vec3f( bounds.max[ 0 ], bounds.max[ 1 ], bounds.max[ 2 ] );
				let center = ( bMin + bMax ) * 0.5;
				let halfExtent = ( bMax - bMin ) * 0.5;
				let worldCenter = ( toWorld * vec4f( center, 1.0 ) ).xyz;
				let worldHalfExtent =
					abs( toWorld[ 0 ].xyz ) * halfExtent.x +
				    abs( toWorld[ 1 ].xyz ) * halfExtent.y +
				    abs( toWorld[ 2 ].xyz ) * halfExtent.z;
				let worldMin = worldCenter - worldHalfExtent;
				let worldMax = worldCenter + worldHalfExtent;

				// intersect if the distance to the bounds is not bigger than the already found
				let d = shape - clamp( shape, worldMin, worldMax );
				return select( 0u, 1u, dot( d, d ) < result.distanceSq );

			}
		`,intersectRangeFn:X`
			fn cppIntersectsRange( shape: vec3f, offset: u32, count: u32, result: ptr<function, ${Ee}> ) -> bool {

				var didHit = false;
				let toWorld = ${i};

				for ( var i = offset; i < offset + count; i ++ ) {

					// transform the triangle to world space
					let i0 = ${t}[ i * 3u + 0u ];
					let i1 = ${t}[ i * 3u + 1u ];
					let i2 = ${t}[ i * 3u + 2u ];
					let a = ( toWorld * vec4f( ${n}[ i0 ].position.xyz, 1.0 ) ).xyz;
					let b = ( toWorld * vec4f( ${n}[ i1 ].position.xyz, 1.0 ) ).xyz;
					let c = ( toWorld * vec4f( ${n}[ i2 ].position.xyz, 1.0 ) ).xyz;

					let barycoord = ${Xe}( shape, a, b, c );
					let closestPoint = barycoord.x * a + barycoord.y * b + barycoord.z * c;
					let delta = shape - closestPoint;
					let distSq = dot( delta, delta );

					// copy the content over
					if ( ! result.found || distSq < result.distanceSq ) {

						let normal = normalize( cross( a - b, b - c ) );

						result.closestPoint = closestPoint;
						result.barycoord = barycoord;
						result.distanceSq = distSq;
						result.faceNormal = normal;
						result.side = sign( dot( normal, delta ) );
						result.faceIndices = vec4u( i0, i1, i2, i );
						result.found = true;
						didHit = true;

					}

				}

				return didHit;

			}
		`,resetShapeFn:X`
				fn cppResetShape( objectIndex: u32 ) -> void {

					// node bounds are transformed by "toWorld" during the bounds tests. Only the
					// object-local BLAS bounds need the object's world matrix - the top-level bounds
					// are already in world space - so restore identity before top-level traversal resumes.
					${i} = mat4x4f(
						1.0, 0.0, 0.0, 0.0,
						0.0, 1.0, 0.0, 0.0,
						0.0, 0.0, 1.0, 0.0,
						0.0, 0.0, 0.0, 1.0
					);

				}
			`,transformShapeFn:X`
			fn cppTransformShape( shape: ptr<function, vec3f>, objectIndex: u32 ) -> void {

				${i} = ${r}[ objectIndex ].matrixWorld;

			}
		`,transformResultFn:X`
			fn cppTransformResult( result: ptr<function, ${Ee}>, objectIndex: u32 ) -> void {

				result.objectIndex = objectIndex;

			}
		`})}var nt=24,rt=(1<<nt)-1,it=31-nt,at=(1<<it)-1,ot=new L,st=new oe,Q=new L,ct=class extends ne{constructor(e,t){super(),t={getBVH:(e,t)=>{throw Error(`ClusteredBVH: getBVH callback must be provided `)},shouldCluster:e=>e.isSkinnedMesh||e.isInstancedMesh||e.isBatchedMesh,primitiveLimit:64,matrixWorld:Array.isArray(e)?new L:e.matrixWorld,includeInstances:!0,_strictLeafSize:1,...t};let n=Array.from(ut(e)),r=Math.ceil(Math.log2(n.length)),i=(1<<r)-1;this.objects=n,this.getBVH=t.getBVH,this.shouldCluster=t.shouldCluster,this.includeInstances=t.includeInstances,this.primitiveLimit=t.primitiveLimit,this.matrixWorld=t.matrixWorld,this.bvhMap=new WeakMap,this.idBits=r,this.idMask=i,this.primitiveBufferStride=2,this.init(t)}init(e){let t=0,{objects:n,bvhMap:r,matrixWorld:i}=this;ot.copy(i).invert(),n.forEach(e=>{let n=[];for(let r=0,i=this._getInstanceCount(e);r<i;r++){let i=this.getBVH(e,r);n.push(i),i&&(t+=this.shouldCluster(e)?i._roots.length:this._countRelevantLeafNodes(i))}r.set(e,n)}),this.primitiveBuffer=new Uint32Array(t*2),this._fillPrimitiveBuffer(this.primitiveBuffer),super.init(e)}getRootRanges(){return[{offset:0,count:this.primitiveBuffer.length/this.primitiveBufferStride}]}refit(...e){ot.copy(this.matrixWorld).invert(),super.refit(...e)}writePrimitiveBounds(e,t,n){let{primitiveBuffer:r,bvhMap:i,objects:a}=this,o=r[2*e+0],s=r[2*e+1],c=a[this.getObjectId(o)],l=this.getInstanceId(o),u=i.get(c)[l],d=this.getBVHRootIndex(s),f=this.getBVHNodeIndex(s);c.isInstancedMesh||c.isBatchedMesh?(c.getMatrixAt(l,Q),Q.premultiply(c.matrixWorld)):Q.copy(c.matrixWorld),Q.premultiply(ot),ie(f,new Float32Array(u._roots[d]),st),st.applyMatrix4(Q);let{min:p,max:m}=st;t[n+0]=p.x,t[n+1]=p.y,t[n+2]=p.z,t[n+3]=m.x,t[n+4]=m.y,t[n+5]=m.z}getInstanceId(e){let{idMask:t,idBits:n}=this;return(e&~t)>>>n}getObjectId(e){let{idMask:t}=this;return e&t}getBVHRootIndex(e){return e>>>nt}getBVHNodeIndex(e){return(e&rt)*8}_getInstanceCount(e){let{includeInstances:t}=this;return e.isInstancedMesh&&t?e.count:e.isBatchedMesh&&t?e.instanceCount:1}_fillPrimitiveBuffer(e){let{objects:t,bvhMap:n,idBits:r,primitiveLimit:i}=this,a=0,o=(t,n,i,o)=>{if(o>rt)throw Error(`ClusteredBVH: cluster node index ${o} exceeds the ${nt}-bit packing limit and cannot be represented.`);if(i>at)throw Error(`ClusteredBVH: bvh root index ${i} exceeds the ${it}-bit packing limit and cannot be represented.`);e[2*a+0]=t<<r|n,e[2*a+1]=i<<nt|o&rt,a++};t.forEach((e,t)=>{n.get(e).forEach((n,r)=>{if(n)if(this.shouldCluster(e))for(let e=0,i=n._roots.length;e<i;e++)o(r,t,e,0);else lt(n,i,(e,n)=>{o(r,t,e,n/8)})})})}_countRelevantLeafNodes(e){let{primitiveLimit:t}=this,n=0;return lt(e,t,(e,r,i,a)=>{n++,a&&i>=t&&console.warn(`ClusteredBVH: a leaf node with ${i} primitives exceeds the cluster primitive limit of ${t} and cannot be subdivided further.`)}),n}};function lt(e,t,n){let r=e._roots.length;for(let i=0;i<r;i++)T.setBVH(e,i),T.traverseBuffer((e,r,a)=>{let o=T.getRangeStart(a),s=T.getRangeEnd(a)-o;return s<t||r?(n(i,a,s,r),!0):!1});T.reset()}function ut(e,t=new Set){return Array.isArray(e)?e.forEach(e=>ut(e,t)):e.traverse(e=>{e.isMesh&&t.add(e)}),t}var $=new L,dt=new L,ft={start:0,count:0,vertexStart:0,vertexCount:0};function pt(e){let t=e;for(;t;){if(t.visible===!1)return!1;t=t.parent}return!0}function mt(e){return e._roots.reduce((e,t)=>e+t.byteLength,0)}function ht(e,t){return`${e}_${t}`}var gt=class{constructor(e,t={}){let{attributes:n={position:`vec4f`},autogenerateBvh:i=!0}=t;Array.isArray(e)||(e=[e]),e=e.map(e=>{if(e.isObject3D)return e;if(e.isBufferGeometry)return new r(e);if(e instanceof ce){let t=new r;return t.geometry.boundsTree=e,t}}),this._bvhCache=new Map,this.autogenerateBvh=i,this.attributes=n,this.objects=e,this.bvh=null,this.storage=new _t,this.structs=new _t({transform:Te}),this.fns=new _t({raycastFirstHit:$e(this),closestPointToPoint:tt(this),sampleTrianglePoint:null},Ae)}getRootObject(){let{objects:e}=this;if(e.isObject3D)return e;Array.isArray(e)||(e=[e]),e=e.map(e=>{if(e.isObject3D)return e;if(e.isBufferGeometry)return new r(e);if(e instanceof ce){let t=new r;return t.geometry.boundsTree=e,t}});let n=new t;return n.children=e,n}getShapecastFn(e){return Ye(this,e)}update(){let e=this.getRootObject(),t=0;e.traverse(e=>{e.isMesh&&t++}),this.bvh=new ct(e,{strategy:2,getBVH:(e,t)=>this.getBVH(e,t,ft),primitiveLimit:t<3?1/0:64}),this.dispose();let{attributes:n,structs:r,bvh:i}=this,o=[],s=[],c=new Map,l=mt(i),u=0,d=0,f=[],p=0,m=this._getTransformMap(i),{primitiveBuffer:h,primitiveBufferStride:g}=i;for(let e=0,t=h.length;e<t;e+=g){let t=h[e],n=h[e+1],r=i.objects[i.getObjectId(t)],a=i.getInstanceId(t),g={start:0,count:0,vertexStart:0,vertexCount:0},_=this.getBVH(r,a,g);if(!_)throw Error(`BVHComputeData: BVH not found.`);let v=o.find(e=>e.bvh===_);v||(v={index:o.length,bvh:_,range:g,geometryOffset:0},u+=v.range.count,d+=v.range.vertexCount,o.push(v));let y=i.getBVHRootIndex(n),b=i.getBVHNodeIndex(n)/8,x=`${v.index}_${y}_${b}`,S=c.get(x);if(S===void 0){let e=Ne(_._roots[y],b);S={data:v,root:y,node:b,size:e,base:0},c.set(x,S),s.push(S),l+=e*32,p=Math.max(p,Fe(_._roots[y],b))}f.push({transformSlot:m.get(ht(t,y)).slot,subtree:S})}if(Fe(i._roots[0])+p-1>Je.value)throw Error(`BVHComputeData: BVH depth overruns the compute stack depth.`);let _=Math.max(m.size,2);u=Math.max(u,2),d=Math.max(d,2);let v=new F(n,`bvh_GeometryStruct`),y=0,b=0,x=new Uint32Array(u),S=new ArrayBuffer(d*v.getLength()*4),C=new ArrayBuffer(l);o.forEach(e=>{e.geometryOffset=b/3,Le(e.bvh,e.range,y,b,x),Re(e.bvh,e.range,y,S,v,this),b+=e.range.count,y+=e.range.vertexCount});let w=mt(i)/32;s.forEach(e=>{e.base=w,Ie(e.data.bvh._roots[e.root],e.node,e.size,e.data.geometryOffset,w,C),w+=e.size}),f.forEach(e=>e.nodeOffset=e.subtree.base),Me(i,f,0,C);let T=new ArrayBuffer(r.transform.getLength()*_*4),ee=a(new E(new Uint32Array(C),1),we).toReadOnly().setName(`bvh_nodes`),D=a(new E(new Uint32Array(T),1),r.transform).toReadOnly().setName(`bvh_transforms`),O=a(new E(x,1),`uint`).toReadOnly().setName(`bvh_index`),k=a(new E(new Uint32Array(S),v.getLength()),v).toReadOnly().setName(`bvh_attributes`);this.storage.transforms=D,this.storage.nodes=ee,this.storage.index=O,this.storage.attributes=k,this.structs.attributes=v,dt.copy(i.matrixWorld).invert(),m.forEach(e=>{this.writeTransformData(e,dt,e.slot,T)}),this.fns.sampleTrianglePoint=et(this),this._bvhCache.clear()}updateTransforms(){let{bvh:e,storage:t}=this;e.refit();let n=t.nodes.proxyNode.value;Me(e,null,0,n.array.buffer),n.needsUpdate=!0;let r=t.transforms.proxyNode.value,i=r.array.buffer;dt.copy(e.matrixWorld).invert(),this._getTransformMap(e).forEach(e=>{this.writeTransformData(e,dt,e.slot,i)}),r.needsUpdate=!0}writeTransformData(e,t,n,r){let{structs:i}=this,a=new Float32Array(r),o=new Uint32Array(r),{object:s,instanceId:c}=e;s.isInstancedMesh||s.isBatchedMesh?(s.getMatrixAt(c,$),$.premultiply(s.matrixWorld)):$.copy(s.matrixWorld),$.premultiply(t),$.toArray(a,n*i.transform.getLength()),$.invert(),$.toArray(a,n*i.transform.getLength()+16);let l=pt(s);s.isBatchedMesh&&(l&&=s.getVisibleAt(c)),o[n*i.transform.getLength()+32]=+!!l}getBVH(e,t,n){let{autogenerateBvh:r,_bvhCache:i}=this,a=null;if(e.boundsTree||e.isSkinnedMesh){let t=e.geometry;if(n.count=t.index?t.index.count:t.attributes.position.count,n.vertexCount=t.attributes.position.count,a=e.boundsTree||null,a===null&&r){let t=e.uuid;a=i.get(t)||new ve(e),i.set(t,a)}}else if(e.isBatchedMesh){let o=e.getGeometryIdAt(t),s=e.getGeometryRangeAt(o);if(Object.assign(n,s),a=e.boundsTrees[o]||null,a===null&&r){let t=`batched_${e.geometry.uuid}_${s.start}_${s.count}`;a=i.get(t)||new N(e.geometry,{range:{...n}}),i.set(t,a)}}else{let t=e.geometry;if(n.count=t.index?t.index.count:t.attributes.position.count,n.vertexCount=t.attributes.position.count,a=e.geometry.boundsTree||null,a===null&&r){let e=t.uuid;a=i.get(e)||new N(t),i.set(e,a)}}return a}getDefaultAttributeValue(e,t){switch(e){case`position`:case`color`:t.set(1,1,1,1);break;default:t.set(0,0,0,0)}return t}dispose(){let{storage:e}=this;for(let t in e)e[t].value?.dispose()}_getTransformMap(e){let{primitiveBuffer:t,primitiveBufferStride:n}=e,r=new Map;for(let i=0,a=t.length;i<a;i+=n){let n=t[i],a=e.getBVHRootIndex(t[i+1]),o=ht(n,a);if(r.has(o))continue;let s=r.size,c=e.objects[e.getObjectId(n)],l=e.getInstanceId(n);r.set(o,{object:c,instanceId:l,compositeId:n,root:a,slot:s})}return r}},_t=class{constructor(e={},t=ke){let n={};return new Proxy({...e},{get(e,r){return n[r]||(n[r]=t(r,e)),n[r]},set(e,t,n){return e[t]=n,!0}})}},vt=Qe,yt=X,bt=[8,8,1],xt=new j,St=new I,Ct=new A,wt=new A(NaN,NaN,NaN),Tt=new I(NaN,NaN,NaN),Et=new I(NaN,NaN,NaN),Dt=new I(NaN,NaN,NaN),Ot=new F({matrixWorld:`mat4x4f`,inverseMatrixWorld:`mat4x4f`,visible:`uint`,_alignment0:`uint`,_alignment1:`uint`,_alignment2:`uint`,baseColorMetalness:`vec4f`,emissionRoughness:`vec4f`},`PathTracingTransformStruct`),kt=class extends gt{constructor(e){super(e,{attributes:{position:`vec4f`,normal:`vec4f`,color:`vec4f`}}),this.structs.transform=Ot}writeTransformData(e,t,n,r){gt.prototype.writeTransformData.call(this,e,t,n,r);let i=Array.isArray(e.object.material)?e.object.material[0]:e.object.material,a=i?.color?.clone()??new I(1,1,1);e.object.getColorAt&&e.instanceId>=0&&(e.object.getColorAt(e.instanceId,St),a.multiply(St));let o=i?.emissive?.clone()??new I(0,0,0);o.multiplyScalar(i?.emissiveIntensity??0);let s=n*Ot.getLength(),c=new Float32Array(r);c[s+36]=a.r,c[s+37]=a.g,c[s+38]=a.b,c[s+39]=i?.metalness??0,c[s+40]=o.r,c[s+41]=o.g,c[s+42]=o.b,c[s+43]=i?.roughness??.85}};function At({renderer:t,camera:r,roots:a,sunLight:o,hemisphereLight:u}){a.forEach(e=>e.updateWorldMatrix(!0,!0));let d=[];a.forEach(e=>{e.traverse(e=>{let t=e;t.visible&&t.isMesh&&t.geometry?.attributes?.position&&t.name!==`grass-tufts`&&d.push(t)})});let f=new kt(d);f.update();let g=yt`
    fn getPathTransform(objectIndex: u32) -> ${Ot} {
      return ${f.storage.transforms}[objectIndex];
    }
  `,y=[new ae(1,1),new ae(1,1)];y.forEach((e,t)=>{e.name=`StarAxis.PathTrace.${t}`,e.type=re,e.generateMipmaps=!1,e.mipmapsAutoUpdate=!1});let C=c(new L),w=c(new L),T=c(new A(0,1,0)),ee=c(new I(1,1,1)),E=c(1),D=c(new I(.55,.68,.9)),O=c(new I(.25,.18,.12)),k=c(1),te=c(0),ne=c(3),ie=c(new A().fromArray(bt)),oe={outputTex:l(y[0]),previousTex:n(y[1]),inverseProjectionMatrix:C,cameraToWorldMatrix:w,sunDirection:T,sunColor:ee,sunIntensity:E,skyColor:D,groundColor:O,skyIntensity:k,sampleIndex:te,maxBounceCount:ne,workgroupSize:ie,workgroupId:b,localId:x},j=S(`
    fn hashRandom(state: ptr<function, u32>) -> f32 {
      var value = (*state);
      value = value ^ 2747636419u;
      value = value * 2654435769u;
      value = value ^ (value >> 16u);
      value = value * 2654435769u;
      value = value ^ (value >> 16u);
      value = value * 2654435769u;
      (*state) = value;
      return f32(value) / 4294967296.0;
    }
  `),se=S(`
      fn compute(
        outputTex: texture_storage_2d<rgba16float, write>,
        previousTex: texture_2d<f32>,
        inverseProjectionMatrix: mat4x4f,
        cameraToWorldMatrix: mat4x4f,
        sunDirection: vec3f,
        sunColor: vec3f,
        sunIntensity: f32,
        skyColor: vec3f,
        groundColor: vec3f,
        skyIntensity: f32,
        sampleIndex: u32,
        maxBounceCount: u32,
        workgroupSize: vec3u,
        workgroupId: vec3u,
        localId: vec3u,
      ) -> void {
        let dimensions = textureDimensions(outputTex);
        let indexUV = workgroupSize.xy * workgroupId.xy + localId.xy;
        if (any(indexUV >= dimensions)) {
          return;
        }

        var randomState =
          indexUV.x * 1973u +
          indexUV.y * 9277u +
          sampleIndex * 26699u +
          911u;
        let jitter = vec2f(hashRandom(&randomState), hashRandom(&randomState)) - 0.5;
        let pixelUV = (vec2f(indexUV) + vec2f(0.5) + jitter) / vec2f(dimensions);
        let ndc = pixelUV * 2.0 - vec2f(1.0);

        var ray = ndcToCameraRay(ndc, cameraToWorldMatrix * inverseProjectionMatrix);
        ray.direction = normalize(ray.direction);

        var radiance = vec3f(0.0);
        var throughput = vec3f(1.0);

        for (var bounce = 0u; bounce < 5u; bounce = bounce + 1u) {
          if (bounce >= maxBounceCount) {
            break;
          }

          var hit: IntersectionResult;
          bvh_RaycastFirstHit(ray, &hit);
          if (!hit.didHit) {
            radiance += throughput * environmentRadiance(
              ray.direction,
              sunDirection,
              sunColor,
              sunIntensity,
              skyColor,
              groundColor,
              skyIntensity
            );
            break;
          }

          let surface = bvh_sampleTrianglePoint(hit.barycoord, hit.indices.xyz);
          let transform = getPathTransform(hit.objectIndex);
          var normal = normalize(
            (transpose(transform.inverseMatrixWorld) * vec4f(surface.normal.xyz, 0.0)).xyz
          );
          if (dot(normal, ray.direction) > 0.0) {
            normal = -normal;
          }

          let baseColor = max(
            surface.color.rgb * transform.baseColorMetalness.rgb,
            vec3f(0.001)
          );
          let metalness = clamp(transform.baseColorMetalness.a, 0.0, 1.0);
          let roughness = clamp(transform.emissionRoughness.a, 0.04, 1.0);
          radiance += throughput * transform.emissionRoughness.rgb;

          let hitPoint = ray.origin + ray.direction * hit.dist;
          let sampledSun = sampleSunDirection(sunDirection, &randomState);
          let sunCosine = max(dot(normal, sampledSun), 0.0);
          if (sunCosine > 0.0) {
            var shadowRay: Ray;
            shadowRay.origin = hitPoint + normal * 0.025;
            shadowRay.direction = sampledSun;
            var shadowHit: IntersectionResult;
            bvh_RaycastFirstHit(shadowRay, &shadowHit);
            if (!shadowHit.didHit) {
              radiance +=
                throughput *
                baseColor *
                (1.0 - metalness) *
                sunColor *
                sunIntensity *
                // Lambertian BRDF normalization, matching Three's raster lights.
                0.31830988618 *
                sunCosine;
            }
          }

          let specularChance = mix(0.08, 0.86, metalness);
          let chooseSpecular = hashRandom(&randomState) < specularChance;
          if (chooseSpecular) {
            let reflected = reflect(ray.direction, normal);
            let roughDirection = cosineHemisphere(normalize(reflected + normal * 0.08), &randomState);
            ray.direction = normalize(mix(reflected, roughDirection, roughness * roughness));
            throughput *= mix(vec3f(0.92), baseColor, metalness);
          } else {
            ray.direction = cosineHemisphere(normal, &randomState);
            throughput *= baseColor;
          }

          ray.origin = hitPoint + normal * 0.025;

          if (bounce >= 2u) {
            let survival = clamp(max(throughput.r, max(throughput.g, throughput.b)), 0.12, 0.92);
            if (hashRandom(&randomState) > survival) {
              break;
            }
            throughput /= survival;
          }
        }

        let previous = textureLoad(previousTex, vec2u(indexUV), 0).rgb;
        let weight = 1.0 / f32(sampleIndex + 1u);
        let accumulated = mix(previous, radiance, weight);
        textureStore(outputTex, indexUV, vec4f(accumulated, 1.0));
      }
    `,[j,S(`
      fn cosineHemisphere(normal: vec3f, state: ptr<function, u32>) -> vec3f {
        let angle = 6.28318530718 * hashRandom(state);
        let radiusSquared = hashRandom(state);
        let radius = sqrt(radiusSquared);
        let local = vec3f(
          cos(angle) * radius,
          sin(angle) * radius,
          sqrt(max(0.0, 1.0 - radiusSquared))
        );
        let helper = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(normal.y) > 0.92);
        let tangent = normalize(cross(helper, normal));
        let bitangent = cross(normal, tangent);
        return normalize(tangent * local.x + bitangent * local.y + normal * local.z);
      }
    `,[j]),S(`
      fn sampleSunDirection(direction: vec3f, state: ptr<function, u32>) -> vec3f {
        let helper = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(direction.y) > 0.92);
        let tangent = normalize(cross(helper, direction));
        let bitangent = cross(direction, tangent);
        let angle = 6.28318530718 * hashRandom(state);
        let radius = sqrt(hashRandom(state)) * 0.0064;
        return normalize(direction + tangent * cos(angle) * radius + bitangent * sin(angle) * radius);
      }
    `,[j]),S(`
    fn environmentRadiance(
      direction: vec3f,
      sunDirection: vec3f,
      sunColor: vec3f,
      sunIntensity: f32,
      skyColor: vec3f,
      groundColor: vec3f,
      skyIntensity: f32
    ) -> vec3f {
      let horizon = smoothstep(-0.28, 0.68, direction.y);
      let atmosphere = mix(groundColor, skyColor, horizon) * skyIntensity;
      let sunDisc = pow(max(dot(direction, sunDirection), 0.0), 32000.0);
      return atmosphere + sunColor * sunIntensity * sunDisc * 4.0;
    }
  `),g,vt,f.fns.raycastFirstHit,f.fns.sampleTrianglePoint])(oe).computeKernel(bt),M=se.computeNode.parameters,ce=_(`vec2`,`vUv`),le=S(`
      fn vertex(position: vec3f, uv: vec2f) -> vec3f {
        varyings.vUv = uv;
        return position;
      }
    `,[ce]),N=new e;N.name=`StarAxis.PathTraceDisplay`,N.positionNode=le({position:m(`position`),uv:m(`uv`)});let P=n(y[0],ce),ue=i().sub(.5).length(),F=p(1).sub(h(.32,.75,ue).mul(.12));N.colorNode=v(s(P.rgb,.06).mul(F),P.a);let de=new Se(N),R=0,z=0,B=0,fe=0,V=3,pe=new L().copy(r.matrixWorld),me=new L().copy(r.projectionMatrix),H=NaN,U=NaN,W=()=>{z=0},G=()=>{t.getDrawingBufferSize(xt);let e=Math.max(1,Math.floor(xt.x)),n=Math.max(1,Math.floor(xt.y));e===B&&n===fe||(B=e,fe=n,y.forEach(t=>t.setSize(e,n,1)),W())},he=()=>{r.updateMatrixWorld(),o.updateMatrixWorld(),o.target.updateMatrixWorld(),Ct.subVectors(o.position,o.target.position).normalize();let e=!wt.equals(Ct)||!Tt.equals(o.color)||!Et.equals(u.color)||!Dt.equals(u.groundColor)||H!==o.intensity||U!==u.intensity,t=!pe.equals(r.matrixWorld)||!me.equals(r.projectionMatrix);(e||t)&&W(),pe.copy(r.matrixWorld),me.copy(r.projectionMatrix),wt.copy(Ct),Tt.copy(o.color),Et.copy(u.color),Dt.copy(u.groundColor),H=o.intensity,U=u.intensity,C.value.copy(r.projectionMatrixInverse),w.value.copy(r.matrixWorld),T.value.copy(Ct),ee.value.copy(o.color),E.value=o.intensity,D.value.copy(u.color),O.value.copy(u.groundColor),k.value=u.intensity};return{render:(e,n)=>{G(),he();let r=Math.min(5,Math.max(1,Math.round(n)));r!==V&&(V=r,W());let i=Math.min(4,Math.max(1,Math.round(e)));for(let e=0;e<i;e++){let e=+(R===0),n=M;n.outputTex.value=y[e],n.previousTex.value=y[R],n.inverseProjectionMatrix.value=C.value,n.cameraToWorldMatrix.value=w.value,n.sunDirection.value=T.value,n.sunColor.value=ee.value,n.sunIntensity.value=E.value,n.skyColor.value=D.value,n.groundColor.value=O.value,n.skyIntensity.value=k.value,n.sampleIndex.value=z,n.maxBounceCount.value=r,n.workgroupSize.value.fromArray(bt),t.compute(se,[Math.ceil(B/bt[0]),Math.ceil(fe/bt[1])]),R=e,z++}P.value=y[R],de.render(t)},reset:W,get samples(){return z}}}export{At as createPathTracer};