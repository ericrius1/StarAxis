import{$n as e,$t as t,Br as n,En as r,Gn as i,Hn as a,Hr as o,Ln as s,Mr as c,On as l,Pn as u,Qn as d,Rn as f,St as p,Vn as m,Vr as h,Xn as g,Xt as _,Zn as v,Zr as y,_i as b,a as x,br as S,c as C,d as w,dr as T,er as ee,fi as E,fr as D,gi as O,hi as k,hr as te,i as ne,j as re,jn as ie,jr as ae,kr as A,l as oe,lr as j,n as se,nr as M,o as N,qn as ce,r as le,s as ue,t as de,u as fe,ur as pe,vr as me,zt as he}from"./MeshBVH-GtynI7MV.js";var P=new O,ge=new O,_e=new O,F=new y,ve=new n,I=new O,ye=new O,be=[`x`,`y`,`z`],L=!0,R=new k,z=new k,B=new k,V=new O,H=new O,xe=new O,Se=class extends le{get primitiveStride(){return 3}constructor(e,t={}){if(!e.isMesh)throw Error(`SkinnedMeshBVH: First argument must be a Mesh.`);super(e.geometry,{...t,[w]:!0}),this.mesh=e,t[w]||this.init(t)}writePrimitiveBounds(e,t,n){let{mesh:r,geometry:i}=this,a=this._indirectBuffer,o=i.index?i.index.array:null,s=(a?a[e]:e)*3,c=s+0,l=s+1,u=s+2;o&&(c=o[c],l=o[l],u=o[u]),r.getVertexPosition(c,P),r.getVertexPosition(l,ge),r.getVertexPosition(u,_e);for(let e=0;e<3;e++){let r=be[e],i=P[r],a=ge[r],o=_e[r],s=i;a<s&&(s=a),o<s&&(s=o);let c=i;a>c&&(c=a),o>c&&(c=o),t[n+e]=s,t[n+e+3]=c}return t}shapecast(e){let t=new se;return super.shapecast({...e,intersectsPrimitive:e.intersectsTriangle,scratchPrimitive:t,iterate:Ce})}raycastObject3D(e,t,n=[]){let{material:r}=e;if(r===void 0)return;let{matrixWorld:i}=e,{firstHitOnly:a}=t;ve.copy(i).invert(),F.copy(t.ray).applyMatrix4(ve);let o=null,s=1/0;return this.shapecast({boundsTraverseOrder:e=>e.distanceToPoint(F.origin),intersectsBounds:e=>{if(a){if(!F.intersectBox(e,ye))return 0;let n;return e.containsPoint(F.origin)?n=0:(ye.applyMatrix4(i),n=t.ray.origin.distanceTo(ye)),+(n<s)}else return+!!F.intersectsBox(e)},intersectsTriangle:(c,l)=>{let u=null;if(u=r.side===0?F.intersectTriangle(c.a,c.b,c.c,!0,I):r.side===1?F.intersectTriangle(c.c,c.b,c.a,!0,I):F.intersectTriangle(c.a,c.b,c.c,!1,I),!u)return;u=u.clone().applyMatrix4(i);let d=t.ray.origin.distanceTo(u);if(d>=t.near&&d<=t.far){if(a&&d>=s)return;let{geometry:t}=this,{index:r}=t,i=this.resolvePrimitiveIndex(l),f=i*3,p=f+0,m=f+1,h=f+2;r&&(p=r.array[p],m=r.array[m],h=r.array[h]);let g={distance:d,point:u.clone(),object:e,uv:null,uv1:null,normal:null,face:{a:p,b:m,c:h,normal:E.getNormal(c.a,c.b,c.c,new O),materialIndex:0},faceIndex:i};if(L){let e=new O;E.getBarycoord(I,c.a,c.b,c.c,e),g.barycoord=e}let _=t.attributes.uv,v=t.attributes.uv1,y=t.attributes.normal;if(_){R.fromBufferAttribute(_,p),z.fromBufferAttribute(_,m),B.fromBufferAttribute(_,h),g.uv=new k;let e=E.getInterpolation(I,c.a,c.b,c.c,R,z,B,g.uv);L||(g.uv=e)}if(v){R.fromBufferAttribute(v,p),z.fromBufferAttribute(v,m),B.fromBufferAttribute(v,h),g.uv1=new k;let e=E.getInterpolation(I,c.a,c.b,c.c,R,z,B,g.uv1);L||(g.uv1=e)}if(y){V.fromBufferAttribute(y,p),H.fromBufferAttribute(y,m),xe.fromBufferAttribute(y,h),g.normal=new O;let e=E.getInterpolation(I,c.a,c.b,c.c,V,H,xe,g.normal);g.normal.dot(F.direction)>0&&g.normal.multiplyScalar(-1),L||(g.normal=e)}s=g.distance,o=g,a||n.push(g)}}}),a&&o&&n.push(o),n}};function Ce(e,t,n,r,i,a,o){let{mesh:s,geometry:c}=n,l=c.index?c.index.array:null;for(let c=e,u=t+e;c<u;c++){let e=n.resolvePrimitiveIndex(c),t=3*e+0,u=3*e+1,d=3*e+2;if(l&&(t=l[t],u=l[u],d=l[d]),s.getVertexPosition(t,o.a),s.getVertexPosition(u,o.b),s.getVertexPosition(d,o.c),o.needsUpdate=!0,r(o,c,i,a))return!0}return!1}var we=new o(-1,1,1,-1,0,1),Te=new class extends me{constructor(){super(),this.setAttribute(`position`,new A([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new A([0,2,0,0,2,0],2))}},Ee=class{constructor(e){this._mesh=new h(Te,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,we)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},U=new T({min:`array<f32, 3>`,max:`array<f32, 3>`},`BVHBoundingBox`);U.getLength=()=>6;var W=new T({bounds:`BVHBoundingBox`,rightChildOrTriangleOffset:`uint`,splitAxisOrTriangleCount:`uint`},`BVHNode`);W.getLength=()=>U.getLength()+2;var De=new T({matrixWorld:`mat4x4f`,inverseMatrixWorld:`mat4x4f`,visible:`uint`,_alignment0:`uint`,_alignment1:`uint`,_alignment2:`uint`},`TransformStruct`),G=new T({origin:`vec3f`,direction:`vec3f`},`Ray`),K=new T({indices:`vec4u`,normal:`vec3f`,didHit:`bool`,barycoord:`vec3f`,objectIndex:`uint`,side:`float`,dist:`float`},`IntersectionResult`),q=new T({faceIndices:`vec4u`,closestPoint:`vec3f`,found:`bool`,barycoord:`vec3f`,objectIndex:`uint`,faceNormal:`vec3f`,side:`float`,distanceSq:`float`},`PointQueryResult`),Oe=class extends M{static get type(){return`ProxyCallNode`}constructor(e,t){super(),this.proxyNode=e,this.params=t}setup(){return this.proxyNode.proxyNode.call(...this.params)}},ke=class{get isNode(){return!0}get proxyNode(){let{proxyObject:e,proxyProperty:t}=this,n=t.split(`.`),r=e;for(let e=0,t=n.length;e<t;e++)r=r?.[n[e]];return r&&`functionNode`in r?r.functionNode:r??null}constructor(e,t=null){return this.proxyObject=t,this.proxyProperty=e,new Proxy(this,{get(e,t){if(t in e)return Reflect.get(e,t);{let n=e.proxyNode;if(!n)return;let r=Reflect.get(n,t);return typeof r==`function`?r.bind(n):r}},set(e,t,n){if(t in e)return Reflect.set(e,t,n);throw Error(`NodeProxy: Cannot set members of proxied nodes.`)}})}},Ae=(...e)=>new ke(...e),J=(...e)=>{let t=new ke(...e);return D.nodeProxyConstructor((...e)=>new Oe(t,e),t)},Y=new b,X=new b;function je(e,t){let n=e?e.array:null,r=new Uint32Array(t.length*3);for(let e=0,i=t.length;e<i;e++){let i=3*e,a=3*t[e];for(let e=0;e<3;e++)r[i+e]=n?n[a+e]:a+e}return r}function Me(e,t,n,r){let i=new Uint32Array(r),a=new Float32Array(r);e._roots.forEach(e=>{let r=new Uint16Array(e),o=new Uint32Array(e);for(let s=0,c=e.byteLength/32;s<c;s++){let c=s*8,l=c*2,u=n*8,d=new Float32Array(e,s*32,6);if(s===0)for(let e=0;e<3;e++){let t=d[e+0],n=d[e+3];t>n?(a[u+e+0]=1,a[u+e+3]=-1):(a[u+e+0]=t,a[u+e+3]=n)}else a.set(d,u);if(t===null){n++;continue}if(N(l,r)){let e=o[c+6],{transformSlot:n,nodeOffset:a}=r[l+14]===0?{transformSlot:0,nodeOffset:0}:t[e];if(n>16777215)throw Error(`packBVHBufferUtils: transform slot ${n} exceeds the 24-bit TLAS leaf limit.`);i[u+6]=a,i[u+7]=4278190080|n&16777215}else i[u+6]=o[c+6],i[u+7]=o[c+7];n++}})}function Ne(e,t){return Pe(new Uint16Array(e),new Uint32Array(e),t)}function Pe(e,t,n){if(N(n*8*2,e))return 1;let r=t[n*8+6];return r+Pe(e,t,n+r)}function Fe(e,t=0){let n=new Uint16Array(e),r=new Uint32Array(e),i=0;return a(t*8,1),i;function a(e,t){let o=e;if(N(e*2,n))i=Math.max(t,i);else{let e=C(o,r);a(ue(o),t+1),a(e,t+1)}}}function Ie(e,t,n,r,i,a){let o=new Uint16Array(a),s=new Uint32Array(a),c=new Float32Array(a),l=new Uint16Array(e),u=new Uint32Array(e);for(let a=0;a<n;a++){let n=t+a,d=n*8,f=d*2,p=i*8,m=p*2,h=new Float32Array(e,n*32,6);if(a===0)for(let e=0;e<3;e++){let t=h[e+0],n=h[e+3];t>n?(c[p+e+0]=1,c[p+e+3]=-1):(c[p+e+0]=t,c[p+e+3]=n)}else c.set(h,p);N(f,l)?(s[p+6]=u[d+6]+r,o[m+14]=l[f+14],o[m+15]=fe):(s[p+6]=u[d+6],s[p+7]=u[d+7]),i++}}function Le(e,t,n,r,i){let{geometry:a}=e,{start:o,count:s,vertexStart:c}=t;if(e.indirect){let t=je(a.index,e._indirectBuffer);for(let e=0;e<t.length;e++)i[e+r]=t[e]-c+n}else if(a.index)for(let e=0;e<s;e++)i[e+r]=a.index.getX(e+o)-c+n;else for(let e=0;e<s;e++)i[e+r]=e+o+n}function Re(e,t,n,r,i,a){let{geometry:o,mesh:s=null}=e,{vertexStart:c,vertexCount:l}=t,u=new Float32Array(r),d=i.getLength();i.membersLayout.forEach(({name:e},t)=>{let r=o.attributes[e];a.getDefaultAttributeValue(e,Y);for(let i=0;i<l;i++){if(r){switch(X.fromBufferAttribute(r,i+c),r.itemSize){case 1:X.y=Y.y,X.z=Y.z,X.w=Y.w;break;case 2:X.z=Y.z,X.w=Y.w;break;case 3:X.w=Y.w;break}s&&(e===`position`||e===`normal`||e===`tangent`)&&s.applyBoneTransform(i+c,X)}else X.copy(Y);X.toArray(u,(n+i)*d+t*4)}})}var ze=class extends M{constructor(e){super(),this.literal=e}build(){return this.literal}},Be=class extends M{constructor(e,t=`property`){super(),this.node=e,this.output=t}build(e){return this.node.build(e,this.output)}};function Ve(e){return e.isNode?new Be(e):null}function He(e){let t=[];for(let n of e)if(Array.isArray(n))for(let e of n){let n=Ve(e);n&&t.push(n)}return t}function Ue(e,t){return e.map(e=>(e&&!e.isNode&&e instanceof Function&&(e=e(t)),e&&e.isNode?(e.setup(t),e.isWGSLTagCodeNode?new Be(e,`inline`):new Be(e)):e))}function We(e,t,n){let r=``;for(let i=0,a=e.length;i<a;i++)if(r+=e[i],i<t.length){let e=t[i];Array.isArray(e)||(typeof e==`string`||typeof e==`number`?r+=String(e):r+=e.build(n))}return r}var Ge=class extends e{static get type(){return`WGSLTagFnNode`}constructor(e,t,n=`wgsl`){super(``,He(t),n),this.isWGSLTagFnNode=!0,this.tokens=e,this.args=t}setup(e){super.setup(e),this._normalizedArgs=Ue(this.args,e)}getNodeFunction(e){let{tokens:t,_normalizedArgs:n}=this,r=e.getDataFromNode(this),i=r.nodeFunction;if(i===void 0){let a=``;for(let r=0,i=t.length;r<i;r++)if(a+=t[r],r<n.length){let t=n[r];Array.isArray(t)||(typeof t==`string`||typeof t==`number`?a+=String(t):t.isStructLayoutNode?a+=t.getNodeType(e):t.isStruct?a+=t.layout.getNodeType(e):a+=`_arg`+r)}a=a.replace(/\/\/.+[\n\r]/g,``),i=e.parser.parseFunction(a),r.nodeFunction=i}return i}generate(e,t){let n=super.generate(e,t),{_normalizedArgs:r}=this,i=We(this.tokens,r,e),{type:a}=this.getNodeFunction(e),o=e.getCodeFromNode(this,a);return o.code=i.replace(/\/\/.+[\n\r]/g,``).replace(/->\s*void/,``).trim(),n}},Ke=class extends d{static get type(){return`WGSLTagCodeNode`}constructor(e,t,n=`wgsl`){super(``,He(t),n),this.isWGSLTagCodeNode=!0,this.tokens=e,this.args=t}setup(e){super.setup(e),this._normalizedArgs=Ue(this.args,e)}build(e,t){return t===`inline`?We(this.tokens,this._normalizedArgs,e):super.build(e,t)}generate(e){super.generate(e);let t=e.getCodeFromNode(this,this.getNodeType(e));return t.code=We(this.tokens,this._normalizedArgs,e),t.code}},qe=e=>D.nodeProxyConstructor((...t)=>{if(t.length===1&&t[0]&&typeof t[0]==`object`&&!t[0].isNode){let e=t[0];for(let t in e)typeof e[t]==`string`&&(e[t]=new ze(e[t]))}return e.call(...t)},e),Z=(e,...t)=>qe(new Ge(e,t)),Q=(e,...t)=>new Ke(e,t),Je=s(60);function Ye(e,t){let{name:n=`bvh_shapecast_fn_${Math.random().toString(36).substring(2,7)}`,shapeStruct:r,resultStruct:i=null,prefixFn:a=null,boundsOrderFn:o=null,intersectsBoundsFn:s,intersectRangeFn:c,transformShapeFn:l=null,transformResultFn:u=null,resetShapeFn:d=null}=t,{nodes:f,transforms:p}=e.storage,m=``;a&&(m=Q`${a}();`);let h=``;u&&(h=Q`${u}( result, objectIndex );`);let g=``;l&&(g=Q`${l}( &localShape, objectIndex );`);let _=``;d&&(_=Q`${d}( objectIndex );`);let v=``;o&&(v=Q`
			let leftToRight = ${o}( localShape, splitAxis, node );
			c1 = select( rightIndex, leftIndex, leftToRight );
			c2 = select( leftIndex, rightIndex, leftToRight );
		`);let y=i?Q`result: ptr<function, ${i}>`:``,b=i?`result`:``,x=Z`
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
	`;return x.outputType=i,x.functionName=n,x}var Xe=Z`
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
`,Ze=Z`
	// fn
	fn intersectRayTriangle( ray: ${G}, a: vec3f, b: vec3f, c: vec3f, threshold: f32 ) -> ${K} {

		const DET_EPSILON = 1e-15;

		var result: ${K};
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
`,Qe=Z`
	// fn
	fn ndcToCameraRay( ndc: vec2f, inverseModelViewProjection: mat4x4f ) -> ${G} {

		var homogeneous = vec4f();
		var ray: ${G};

		homogeneous = inverseModelViewProjection * vec4f( ndc, 0.0, 1.0 );
		ray.origin = homogeneous.xyz / homogeneous.w;

		homogeneous = inverseModelViewProjection * vec4f( ndc, 1.0, 1.0 );
		ray.direction = ( homogeneous.xyz / homogeneous.w ) - ray.origin;

		return ray;

	}
`;function $e(e){let{index:t,attributes:n,transforms:r}=e.storage,i=he(1).toVar(`bvh_rayScalar_${Math.random().toString(36).substring(2,7)}`);return e.getShapecastFn({name:`bvh_RaycastFirstHit`,shapeStruct:G,resultStruct:K,boundsOrderFn:Z`
			fn getBoundsOrder( ray: ${G}, splitAxis: u32, node: ${W} ) -> bool {

				return ray.direction[ splitAxis ] >= 0.0;

			}
		`,intersectsBoundsFn:Z`
			fn rayIntersectsBounds( ray: ${G}, bounds: ${U}, result: ptr<function, ${K}> ) -> u32 {

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

		`,intersectRangeFn:Z`
			fn intersectRange( ray: ${G}, offset: u32, count: u32, result: ptr<function, ${K}> ) -> bool {

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
		`,transformShapeFn:Z`
			fn transformRay( ray: ptr<function, ${G}>, objectIndex: u32 ) -> void {

				let toLocal = ${r}[ objectIndex ].inverseMatrixWorld;
				ray.origin = ( toLocal * vec4f( ray.origin, 1.0 ) ).xyz;
				ray.direction = ( toLocal * vec4f( ray.direction, 0.0 ) ).xyz;

				let len = length( ray.direction );
				ray.direction /= len;
				${i} = 1.0 / len;

			}
		`,transformResultFn:Z`
			fn transformResult( hit: ptr<function, ${K}>, objectIndex: u32 ) -> void {

				let toLocal = ${r}[ objectIndex ].inverseMatrixWorld;
				hit.normal = normalize( ( transpose( toLocal ) * vec4f( hit.normal, 0.0 ) ).xyz );
				hit.objectIndex = objectIndex;

			}
		`,resetShapeFn:Z`
			fn resetRayScalar( objectIndex: u32 ) -> void {

				${i} = 1.0;

			}
		`})}function et(e){let{storage:t,structs:n}=e,r=n.attributes.membersLayout.map(({name:e})=>`result.${e} = a0.${e} * barycoord.x + a1.${e} * barycoord.y + a2.${e} * barycoord.z;`).join(`
`);return Z`
		// fn
		fn bvh_sampleTrianglePoint( barycoord: vec3f, indices: vec3u ) -> ${n.attributes} {

			var result: ${n.attributes};
			var a0 = ${t.attributes}[ indices.x ];
			var a1 = ${t.attributes}[ indices.y ];
			var a2 = ${t.attributes}[ indices.z ];
			${r}
			return result;

		}
	`}function tt(e){let{index:n,attributes:r,transforms:i}=e.storage,a=t().toVar(`bvh_toWorldMat`);return e.getShapecastFn({name:`bvh_ClosestPointToPoint`,shapeStruct:`vec3f`,resultStruct:q,boundsOrderFn:Z`
			fn cppBoundsOrder( shape: vec3f, splitAxis: u32, node: ${W} ) -> bool {

				let toWorld = ${a};

				// get center
				let bMin = vec3f( node.bounds.min[ 0 ], node.bounds.min[ 1 ], node.bounds.min[ 2 ] );
				let bMax = vec3f( node.bounds.max[ 0 ], node.bounds.max[ 1 ], node.bounds.max[ 2 ] );
				let center = bMin * 0.5 + bMax * 0.5;

				// determine the order in world space
				let worldCenter = ( toWorld * vec4f( center, 1.0 ) ).xyz;
				let worldAxis = normalize( toWorld[ splitAxis ].xyz );
				return dot( shape - worldCenter, worldAxis ) <= 0.0;

			}
		`,intersectsBoundsFn:Z`
			fn cppIntersectsBounds( shape: vec3f, bounds: ${U}, result: ptr<function, ${q}> ) -> u32 {

				// return 1u;
				// we need to check this no matter what if the result has not been found yet
				if ( ! result.found ) {

					return 1u;

				}

				let toWorld = ${a};

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
		`,intersectRangeFn:Z`
			fn cppIntersectsRange( shape: vec3f, offset: u32, count: u32, result: ptr<function, ${q}> ) -> bool {

				var didHit = false;
				let toWorld = ${a};

				for ( var i = offset; i < offset + count; i ++ ) {

					// transform the triangle to world space
					let i0 = ${n}[ i * 3u + 0u ];
					let i1 = ${n}[ i * 3u + 1u ];
					let i2 = ${n}[ i * 3u + 2u ];
					let a = ( toWorld * vec4f( ${r}[ i0 ].position.xyz, 1.0 ) ).xyz;
					let b = ( toWorld * vec4f( ${r}[ i1 ].position.xyz, 1.0 ) ).xyz;
					let c = ( toWorld * vec4f( ${r}[ i2 ].position.xyz, 1.0 ) ).xyz;

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
		`,resetShapeFn:Z`
				fn cppResetShape( objectIndex: u32 ) -> void {

					// node bounds are transformed by "toWorld" during the bounds tests. Only the
					// object-local BLAS bounds need the object's world matrix - the top-level bounds
					// are already in world space - so restore identity before top-level traversal resumes.
					${a} = mat4x4f(
						1.0, 0.0, 0.0, 0.0,
						0.0, 1.0, 0.0, 0.0,
						0.0, 0.0, 1.0, 0.0,
						0.0, 0.0, 0.0, 1.0
					);

				}
			`,transformShapeFn:Z`
			fn cppTransformShape( shape: ptr<function, vec3f>, objectIndex: u32 ) -> void {

				${a} = ${i}[ objectIndex ].matrixWorld;

			}
		`,transformResultFn:Z`
			fn cppTransformResult( result: ptr<function, ${q}>, objectIndex: u32 ) -> void {

				result.objectIndex = objectIndex;

			}
		`})}var nt=24,rt=(1<<nt)-1,it=31-nt,at=(1<<it)-1,ot=new n,st=new te,ct=new n,lt=class extends ne{constructor(e,t){super(),t={getBVH:(e,t)=>{throw Error(`ClusteredBVH: getBVH callback must be provided `)},shouldCluster:e=>e.isSkinnedMesh||e.isInstancedMesh||e.isBatchedMesh,primitiveLimit:64,matrixWorld:Array.isArray(e)?new n:e.matrixWorld,includeInstances:!0,_strictLeafSize:1,...t};let r=Array.from(dt(e)),i=Math.ceil(Math.log2(r.length)),a=(1<<i)-1;this.objects=r,this.getBVH=t.getBVH,this.shouldCluster=t.shouldCluster,this.includeInstances=t.includeInstances,this.primitiveLimit=t.primitiveLimit,this.matrixWorld=t.matrixWorld,this.bvhMap=new WeakMap,this.idBits=i,this.idMask=a,this.primitiveBufferStride=2,this.init(t)}init(e){let t=0,{objects:n,bvhMap:r,matrixWorld:i}=this;ot.copy(i).invert(),n.forEach(e=>{let n=[];for(let r=0,i=this._getInstanceCount(e);r<i;r++){let i=this.getBVH(e,r);n.push(i),i&&(t+=this.shouldCluster(e)?i._roots.length:this._countRelevantLeafNodes(i))}r.set(e,n)}),this.primitiveBuffer=new Uint32Array(t*2),this._fillPrimitiveBuffer(this.primitiveBuffer),super.init(e)}getRootRanges(){return[{offset:0,count:this.primitiveBuffer.length/this.primitiveBufferStride}]}refit(...e){ot.copy(this.matrixWorld).invert(),super.refit(...e)}writePrimitiveBounds(e,t,n){let{primitiveBuffer:r,bvhMap:i,objects:a}=this,o=r[2*e+0],s=r[2*e+1],c=a[this.getObjectId(o)],l=this.getInstanceId(o),u=i.get(c)[l],d=this.getBVHRootIndex(s),f=this.getBVHNodeIndex(s);c.isInstancedMesh||c.isBatchedMesh?(c.getMatrixAt(l,ct),ct.premultiply(c.matrixWorld)):ct.copy(c.matrixWorld),ct.premultiply(ot),oe(f,new Float32Array(u._roots[d]),st),st.applyMatrix4(ct);let{min:p,max:m}=st;t[n+0]=p.x,t[n+1]=p.y,t[n+2]=p.z,t[n+3]=m.x,t[n+4]=m.y,t[n+5]=m.z}getInstanceId(e){let{idMask:t,idBits:n}=this;return(e&~t)>>>n}getObjectId(e){let{idMask:t}=this;return e&t}getBVHRootIndex(e){return e>>>nt}getBVHNodeIndex(e){return(e&rt)*8}_getInstanceCount(e){let{includeInstances:t}=this;return e.isInstancedMesh&&t?e.count:e.isBatchedMesh&&t?e.instanceCount:1}_fillPrimitiveBuffer(e){let{objects:t,bvhMap:n,idBits:r,primitiveLimit:i}=this,a=0,o=(t,n,i,o)=>{if(o>rt)throw Error(`ClusteredBVH: cluster node index ${o} exceeds the ${nt}-bit packing limit and cannot be represented.`);if(i>at)throw Error(`ClusteredBVH: bvh root index ${i} exceeds the ${it}-bit packing limit and cannot be represented.`);e[2*a+0]=t<<r|n,e[2*a+1]=i<<nt|o&rt,a++};t.forEach((e,t)=>{n.get(e).forEach((n,r)=>{if(n)if(this.shouldCluster(e))for(let e=0,i=n._roots.length;e<i;e++)o(r,t,e,0);else ut(n,i,(e,n)=>{o(r,t,e,n/8)})})})}_countRelevantLeafNodes(e){let{primitiveLimit:t}=this,n=0;return ut(e,t,(e,r,i,a)=>{n++,a&&i>=t&&console.warn(`ClusteredBVH: a leaf node with ${i} primitives exceeds the cluster primitive limit of ${t} and cannot be subdivided further.`)}),n}};function ut(e,t,n){let r=e._roots.length;for(let i=0;i<r;i++)x.setBVH(e,i),x.traverseBuffer((e,r,a)=>{let o=x.getRangeStart(a),s=x.getRangeEnd(a)-o;return s<t||r?(n(i,a,s,r),!0):!1});x.reset()}function dt(e,t=new Set){return Array.isArray(e)?e.forEach(e=>dt(e,t)):e.traverse(e=>{e.isMesh&&t.add(e)}),t}var $=new n,ft=new n,pt={start:0,count:0,vertexStart:0,vertexCount:0};function mt(e){let t=e;for(;t;){if(t.visible===!1)return!1;t=t.parent}return!0}function ht(e){return e._roots.reduce((e,t)=>e+t.byteLength,0)}function gt(e,t){return`${e}_${t}`}var _t=class{constructor(e,t={}){let{attributes:n={position:`vec4f`},autogenerateBvh:r=!0}=t;Array.isArray(e)||(e=[e]),e=e.map(e=>{if(e.isObject3D)return e;if(e.isBufferGeometry)return new h(e);if(e instanceof le){let t=new h;return t.geometry.boundsTree=e,t}}),this._bvhCache=new Map,this.autogenerateBvh=r,this.attributes=n,this.objects=e,this.bvh=null,this.storage=new vt,this.structs=new vt({transform:De}),this.fns=new vt({raycastFirstHit:$e(this),closestPointToPoint:tt(this),sampleTrianglePoint:null},J)}getRootObject(){let{objects:e}=this;if(e.isObject3D)return e;Array.isArray(e)||(e=[e]),e=e.map(e=>{if(e.isObject3D)return e;if(e.isBufferGeometry)return new h(e);if(e instanceof le){let t=new h;return t.geometry.boundsTree=e,t}});let t=new ae;return t.children=e,t}getShapecastFn(e){return Ye(this,e)}update(){let e=this.getRootObject(),t=0;e.traverse(e=>{e.isMesh&&t++}),this.bvh=new lt(e,{strategy:2,getBVH:(e,t)=>this.getBVH(e,t,pt),primitiveLimit:t<3?1/0:64}),this.dispose();let{attributes:n,structs:r,bvh:i}=this,a=[],o=[],s=new Map,c=ht(i),u=0,d=0,f=[],p=0,m=this._getTransformMap(i),{primitiveBuffer:h,primitiveBufferStride:g}=i;for(let e=0,t=h.length;e<t;e+=g){let t=h[e],n=h[e+1],r=i.objects[i.getObjectId(t)],l=i.getInstanceId(t),g={start:0,count:0,vertexStart:0,vertexCount:0},_=this.getBVH(r,l,g);if(!_)throw Error(`BVHComputeData: BVH not found.`);let v=a.find(e=>e.bvh===_);v||(v={index:a.length,bvh:_,range:g,geometryOffset:0},u+=v.range.count,d+=v.range.vertexCount,a.push(v));let y=i.getBVHRootIndex(n),b=i.getBVHNodeIndex(n)/8,x=`${v.index}_${y}_${b}`,S=s.get(x);if(S===void 0){let e=Ne(_._roots[y],b);S={data:v,root:y,node:b,size:e,base:0},s.set(x,S),o.push(S),c+=e*32,p=Math.max(p,Fe(_._roots[y],b))}f.push({transformSlot:m.get(gt(t,y)).slot,subtree:S})}if(Fe(i._roots[0])+p-1>Je.value)throw Error(`BVHComputeData: BVH depth overruns the compute stack depth.`);let _=Math.max(m.size,2);u=Math.max(u,2),d=Math.max(d,2);let v=new T(n,`bvh_GeometryStruct`),y=0,b=0,x=new Uint32Array(u),S=new ArrayBuffer(d*v.getLength()*4),C=new ArrayBuffer(c);a.forEach(e=>{e.geometryOffset=b/3,Le(e.bvh,e.range,y,b,x),Re(e.bvh,e.range,y,S,v,this),b+=e.range.count,y+=e.range.vertexCount});let w=ht(i)/32;o.forEach(e=>{e.base=w,Ie(e.data.bvh._roots[e.root],e.node,e.size,e.data.geometryOffset,w,C),w+=e.size}),f.forEach(e=>e.nodeOffset=e.subtree.base),Me(i,f,0,C);let ee=new ArrayBuffer(r.transform.getLength()*_*4),E=l(new j(new Uint32Array(C),1),W).toReadOnly().setName(`bvh_nodes`),D=l(new j(new Uint32Array(ee),1),r.transform).toReadOnly().setName(`bvh_transforms`),O=l(new j(x,1),`uint`).toReadOnly().setName(`bvh_index`),k=l(new j(new Uint32Array(S),v.getLength()),v).toReadOnly().setName(`bvh_attributes`);this.storage.transforms=D,this.storage.nodes=E,this.storage.index=O,this.storage.attributes=k,this.structs.attributes=v,ft.copy(i.matrixWorld).invert(),m.forEach(e=>{this.writeTransformData(e,ft,e.slot,ee)}),this.fns.sampleTrianglePoint=et(this),this._bvhCache.clear()}updateTransforms(){let{bvh:e,storage:t}=this;e.refit();let n=t.nodes.proxyNode.value;Me(e,null,0,n.array.buffer),n.needsUpdate=!0;let r=t.transforms.proxyNode.value,i=r.array.buffer;ft.copy(e.matrixWorld).invert(),this._getTransformMap(e).forEach(e=>{this.writeTransformData(e,ft,e.slot,i)}),r.needsUpdate=!0}writeTransformData(e,t,n,r){let{structs:i}=this,a=new Float32Array(r),o=new Uint32Array(r),{object:s,instanceId:c}=e;s.isInstancedMesh||s.isBatchedMesh?(s.getMatrixAt(c,$),$.premultiply(s.matrixWorld)):$.copy(s.matrixWorld),$.premultiply(t),$.toArray(a,n*i.transform.getLength()),$.invert(),$.toArray(a,n*i.transform.getLength()+16);let l=mt(s);s.isBatchedMesh&&(l&&=s.getVisibleAt(c)),o[n*i.transform.getLength()+32]=+!!l}getBVH(e,t,n){let{autogenerateBvh:r,_bvhCache:i}=this,a=null;if(e.boundsTree||e.isSkinnedMesh){let t=e.geometry;if(n.count=t.index?t.index.count:t.attributes.position.count,n.vertexCount=t.attributes.position.count,a=e.boundsTree||null,a===null&&r){let t=e.uuid;a=i.get(t)||new Se(e),i.set(t,a)}}else if(e.isBatchedMesh){let o=e.getGeometryIdAt(t),s=e.getGeometryRangeAt(o);if(Object.assign(n,s),a=e.boundsTrees[o]||null,a===null&&r){let t=`batched_${e.geometry.uuid}_${s.start}_${s.count}`;a=i.get(t)||new de(e.geometry,{range:{...n}}),i.set(t,a)}}else{let t=e.geometry;if(n.count=t.index?t.index.count:t.attributes.position.count,n.vertexCount=t.attributes.position.count,a=e.geometry.boundsTree||null,a===null&&r){let e=t.uuid;a=i.get(e)||new de(t),i.set(e,a)}}return a}getDefaultAttributeValue(e,t){switch(e){case`position`:case`color`:t.set(1,1,1,1);break;default:t.set(0,0,0,0)}return t}dispose(){let{storage:e}=this;for(let t in e)e[t].value?.dispose()}_getTransformMap(e){let{primitiveBuffer:t,primitiveBufferStride:n}=e,r=new Map;for(let i=0,a=t.length;i<a;i+=n){let n=t[i],a=e.getBVHRootIndex(t[i+1]),o=gt(n,a);if(r.has(o))continue;let s=r.size,c=e.objects[e.getObjectId(n)],l=e.getInstanceId(n);r.set(o,{object:c,instanceId:l,compositeId:n,root:a,slot:s})}return r}},vt=class{constructor(e={},t=Ae){let n={};return new Proxy({...e},{get(e,r){return n[r]||(n[r]=t(r,e)),n[r]},set(e,t,n){return e[t]=n,!0}})}},yt=Qe,bt=Z,xt=[8,8,1],St=1024,Ct=new k,wt=new S,Tt=new O,Et=new O,Dt=new O(NaN,NaN,NaN),Ot=new O(NaN,NaN,NaN),kt=new S(NaN,NaN,NaN),At=new S(NaN,NaN,NaN),jt=new S(NaN,NaN,NaN);function Mt(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}var Nt=new T({matrixWorld:`mat4x4f`,inverseMatrixWorld:`mat4x4f`,visible:`uint`,_alignment0:`uint`,_alignment1:`uint`,_alignment2:`uint`,baseColorMetalness:`vec4f`,emissionRoughness:`vec4f`},`PathTracingTransformStruct`),Pt=class extends _t{constructor(e){super(e,{attributes:{position:`vec4f`,normal:`vec4f`,color:`vec4f`}}),this.structs.transform=Nt}writeTransformData(e,t,n,r){_t.prototype.writeTransformData.call(this,e,t,n,r);let i=Array.isArray(e.object.material)?e.object.material[0]:e.object.material,a=i?.userData?.traced,o=(a?.color??i?.color)?.clone()??new S(1,1,1);e.object.getColorAt&&e.instanceId>=0&&(e.object.getColorAt(e.instanceId,wt),o.multiply(wt));let s=(a?a.emissive:i?.emissive)?.clone()??new S(0,0,0);a||s.multiplyScalar(i?.emissiveIntensity??0);let c=n*Nt.getLength(),l=new Float32Array(r);l[c+36]=o.r,l[c+37]=o.g,l[c+38]=o.b,l[c+39]=a?.metalness??i?.metalness??0,l[c+40]=s.r,l[c+41]=s.g,l[c+42]=s.b,l[c+43]=a?.roughness??i?.roughness??.85}};function Ft({renderer:e,camera:t,roots:o,sunLight:s,moonLight:l,hemisphereLight:d}){o.forEach(e=>e.updateWorldMatrix(!0,!0));let h=[];o.forEach(e=>{e.traverse(e=>{let t=e;t.visible&&t.isMesh&&t.geometry?.attributes?.position&&t.name!==`grass-tufts`&&h.push(t)})});let y=new Pt(h);y.update();let b=bt`
    fn getPathTransform(objectIndex: u32) -> ${Nt} {
      return ${y.storage.transforms}[objectIndex];
    }
  `,x=[new pe(1,1),new pe(1,1)];x.forEach((e,t)=>{e.name=`StarAxis.PathTrace.${t}`,e.type=c,e.generateMipmaps=!1,e.mipmapsAutoUpdate=!1});let C=f(new n),w=f(new n),T=f(new O(0,1,0)),E=f(new S(1,1,1)),D=f(1),k=f(new O(0,-1,0)),te=f(new S(.66,.76,.91)),ne=f(0),ae=f(new S(.55,.68,.9)),A=f(new S(.25,.18,.12)),oe=f(1),j=f(0),se=f(3),M=f(0),N=f(0),le=f(64),ue=f(new O(0,Math.sin(re),-Math.cos(re)).normalize()),de=f(28e-5),fe=f(new O().fromArray(xt)),me={outputTex:u(x[0]),previousTex:ie(x[1]),inverseProjectionMatrix:C,cameraToWorldMatrix:w,sunDirection:T,sunColor:E,sunIntensity:D,moonDirection:k,moonColor:te,moonIntensity:ne,skyColor:ae,groundColor:A,skyIntensity:oe,sampleIndex:j,maxBounceCount:se,aerialDensity:de,starTrailArc:M,celestialOffset:N,exposureSamples:le,polarisAxis:ue,workgroupSize:fe,workgroupId:v,localId:_},P=g(`
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
  `),ge=g(`
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
    `,[P]),_e=g(`
      fn sampleConeDirection(direction: vec3f, spread: f32, state: ptr<function, u32>) -> vec3f {
        let helper = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(direction.y) > 0.92);
        let tangent = normalize(cross(helper, direction));
        let bitangent = cross(direction, tangent);
        let angle = 6.28318530718 * hashRandom(state);
        let radius = sqrt(hashRandom(state)) * spread;
        return normalize(direction + tangent * cos(angle) * radius + bitangent * sin(angle) * radius);
      }
    `,[P]),F=g(`
    fn haltonSample(index: u32, base: u32) -> f32 {
      var result = 0.0;
      var fraction = 1.0;
      var remaining = index;
      let divisor = f32(base);
      for (var step = 0u; step < 20u; step = step + 1u) {
        if (remaining == 0u) {
          break;
        }
        fraction = fraction / divisor;
        result = result + fraction * f32(remaining % base);
        remaining = remaining / base;
      }
      return result;
    }
  `),ve=g(`
    fn hashPosition(position: vec3f) -> f32 {
      var value = fract(position * 0.1031);
      value += dot(value, value.yzx + vec3f(33.33));
      return fract((value.x + value.y) * value.z);
    }
  `),I=g(`
      fn cloudFbm(position: vec3f) -> f32 {
        var point = position;
        var amplitude = 0.5;
        var density = 0.0;
        for (var octave = 0u; octave < 4u; octave += 1u) {
          density += valueNoise(point) * amplitude;
          point = point * 2.03 + vec3f(7.1, 3.7, -5.4);
          amplitude *= 0.5;
        }
        return density;
      }
    `,[g(`
      fn valueNoise(position: vec3f) -> f32 {
        let cell = floor(position);
        var blend = fract(position);
        blend = blend * blend * (vec3f(3.0) - 2.0 * blend);

        let lower = mix(
          mix(
            hashPosition(cell),
            hashPosition(cell + vec3f(1.0, 0.0, 0.0)),
            blend.x
          ),
          mix(
            hashPosition(cell + vec3f(0.0, 1.0, 0.0)),
            hashPosition(cell + vec3f(1.0, 1.0, 0.0)),
            blend.x
          ),
          blend.y
        );
        let upper = mix(
          mix(
            hashPosition(cell + vec3f(0.0, 0.0, 1.0)),
            hashPosition(cell + vec3f(1.0, 0.0, 1.0)),
            blend.x
          ),
          mix(
            hashPosition(cell + vec3f(0.0, 1.0, 1.0)),
            hashPosition(cell + vec3f(1.0, 1.0, 1.0)),
            blend.x
          ),
          blend.y
        );
        return mix(lower, upper, blend.z);
      }
    `,[ve])]),ye=g(`
      fn starField(direction: vec3f) -> vec3f {
        return starLayer(direction, vec2f(760.0, 380.0), 19.17, 0.9955, 4.6) +
               starLayer(direction, vec2f(1500.0, 750.0), 61.83, 0.977, 0.85);
      }
    `,[g(`
      fn starLayer(direction: vec3f, density: vec2f, salt: f32, threshold: f32, gain: f32) -> vec3f {
        let sphericalUv = vec2f(
          atan2(direction.z, direction.x) * 0.15915494309 + 0.5,
          acos(clamp(direction.y, -1.0, 1.0)) * 0.31830988618
        );
        let starGrid = sphericalUv * density;
        let cell = floor(starGrid);
        let cellUv = fract(starGrid) - 0.5;
        let seed = hashPosition(vec3f(cell, salt));
        let temperature = hashPosition(vec3f(cell, salt + 54.24));
        let exists = smoothstep(threshold, 1.0, seed);
        let core = 1.0 - smoothstep(0.02, 0.17, length(cellUv));
        let rareSparkle = smoothstep(threshold + (1.0 - threshold) * 0.87, 1.0, seed);
        let starColor = mix(
          vec3f(0.56, 0.72, 1.0),
          vec3f(1.0, 0.72, 0.42),
          pow(temperature, 5.0)
        );
        return starColor * exists * core * gain * (1.0 + rareSparkle * 2.2);
      }
    `,[ve])]),be=g(`
    fn scatteringColor(
      direction: vec3f,
      sunDirection: vec3f,
      skyColor: vec3f,
      groundColor: vec3f,
      skyIntensity: f32,
      moonDirection: vec3f,
      moonAmount: f32
    ) -> vec3f {
      let sunElevation = sunDirection.y;
      let nightMix = 1.0 - smoothstep(-0.20, 0.02, sunElevation);
      let dayMix = smoothstep(0.02, 0.26, sunElevation);
      let duskMix = clamp(1.0 - nightMix - dayMix, 0.0, 1.0);

      let up = clamp(direction.y, -1.0, 1.0);
      let sky01 = smoothstep(-0.02, 0.62, up);
      let horizonBand = pow(clamp(1.0 - max(up, 0.0) * 3.1, 0.0, 1.0), 1.7);
      let sunFacing = max(dot(direction, sunDirection), 0.0);

      // Azimuthal alignment with the sun: 1 straight toward it, 0 behind.
      let flatView = normalize(vec3f(direction.x, 0.0, direction.z) + vec3f(1e-4, 0.0, 1e-4));
      let flatSun = normalize(vec3f(sunDirection.x, 0.0, sunDirection.z) + vec3f(1e-4, 0.0, 1e-4));
      let sunSide = clamp(dot(flatView, flatSun) * 0.5 + 0.5, 0.0, 1.0);

      // ---- DAY: Rayleigh blue holds the zenith and only the lower sky takes
      // the hemisphere light's tint. Driving the whole dome from that tint is
      // what turns a golden hour into a flat peach wash — at a real 8° sun the
      // top of the sky is still blue.
      let dayZenith =
        mix(vec3f(0.075, 0.155, 0.40), skyColor * 0.55, 0.35) * skyIntensity * 1.5;
      let dayHorizon =
        mix(groundColor * 0.9, skyColor * 1.25, 0.6) * skyIntensity;
      let dayColor =
        mix(dayHorizon, dayZenith, sky01) +
        vec3f(1.0, 0.88, 0.66) * pow(sunFacing, 6.0) * 0.16 * skyIntensity;

      // ---- DUSK: deep blue at the zenith through a violet mid-sky down to an
      // ember horizon on the sun's side, with the magenta anti-twilight arch
      // opposite. This band is the whole sunset.
      let ember = vec3f(1.30, 0.40, 0.095);
      let amber = vec3f(0.95, 0.40, 0.135);
      let violet = vec3f(0.235, 0.155, 0.315);
      let zenithDusk = vec3f(0.055, 0.085, 0.215);
      let counterGlow = vec3f(0.24, 0.145, 0.27);
      var duskColor = mix(violet, zenithDusk, smoothstep(0.12, 0.72, up));
      duskColor = mix(duskColor, amber, horizonBand * (0.18 + 0.82 * sunSide));
      duskColor += ember * pow(sunFacing, 5.0) * 0.9;
      duskColor += ember * horizonBand * pow(sunSide, 6.0) * 0.6;
      duskColor += counterGlow * horizonBand * (1.0 - sunSide) * 0.4;

      // ---- NIGHT: a real floor plus the moon's own glow in the sky.
      let moonFacing = max(dot(direction, moonDirection), 0.0);
      let nightColor =
        mix(vec3f(0.021, 0.029, 0.055), vec3f(0.006, 0.011, 0.028), sky01) +
        vec3f(0.055, 0.075, 0.135) * pow(moonFacing, 5.0) * moonAmount;

      var result = dayColor * dayMix + duskColor * duskMix + nightColor * nightMix;

      // Below grade the "sky" becomes lit ground haze, so downward bounce
      // rays pick up bounce light instead of a hard black hemisphere.
      let below = smoothstep(0.0, -0.16, up);
      let groundLit =
        groundColor * skyIntensity * (0.30 + 0.70 * (dayMix + duskMix * 0.55));
      return mix(result, groundLit, below * 0.85);
    }
  `),L=g(`
      fn compute(
        outputTex: texture_storage_2d<rgba16float, write>,
        previousTex: texture_2d<f32>,
        inverseProjectionMatrix: mat4x4f,
        cameraToWorldMatrix: mat4x4f,
        sunDirection: vec3f,
        sunColor: vec3f,
        sunIntensity: f32,
        moonDirection: vec3f,
        moonColor: vec3f,
        moonIntensity: f32,
        skyColor: vec3f,
        groundColor: vec3f,
        skyIntensity: f32,
        sampleIndex: u32,
        maxBounceCount: u32,
        aerialDensity: f32,
        starTrailArc: f32,
        celestialOffset: f32,
        exposureSamples: u32,
        polarisAxis: vec3f,
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

        // Stratified camera jitter, Cranley-Patterson rotated per pixel so the
        // shared Halton points do not print a visible lattice across the frame.
        let pixelOffset = vec2f(hashRandom(&randomState), hashRandom(&randomState));
        let stratified = vec2f(
          haltonSample(sampleIndex + 1u, 2u),
          haltonSample(sampleIndex + 1u, 3u)
        );
        let jitter = fract(stratified + pixelOffset) - vec2f(0.5);
        let pixelUV = (vec2f(indexUV) + vec2f(0.5) + jitter) / vec2f(dimensions);
        let ndc = pixelUV * 2.0 - vec2f(1.0);

        var ray = ndcToCameraRay(ndc, cameraToWorldMatrix * inverseProjectionMatrix);
        ray.direction = normalize(ray.direction);
        let viewDirection = ray.direction;

        // Where this sample sits in the exposure. Sweeping it across the
        // frame's samples is what turns the star field into trails.
        // celestialOffset is where the sky has turned to by this frame;
        // starTrailArc is how far it turns during the frame's own exposure.
        let exposureSpan = max(exposureSamples, 1u);
        let celestialPhase = celestialOffset +
          starTrailArc * (f32(sampleIndex % exposureSpan) / f32(exposureSpan));

        var radiance = vec3f(0.0);
        var throughput = vec3f(1.0);
        var primaryDistance = -1.0;

        for (var bounce = 0u; bounce < 5u; bounce = bounce + 1u) {
          if (bounce >= maxBounceCount) {
            break;
          }

          var hit: IntersectionResult;
          bvh_RaycastFirstHit(ray, &hit);
          if (!hit.didHit) {
            var escaped = environmentRadiance(
              ray.direction,
              sunDirection,
              sunColor,
              sunIntensity,
              skyColor,
              groundColor,
              skyIntensity,
              moonDirection,
              moonColor,
              moonIntensity,
              celestialPhase,
              polarisAxis
            );
            // A bounce ray that happens to land on the solar disc carries
            // hundreds of times the surrounding sky's energy and burns in a
            // permanent white speckle. Clamp indirect hits only — the camera's
            // own view of the disc has to stay unclipped.
            if (bounce > 0u) {
              escaped = min(escaped, vec3f(6.0));
            }
            radiance += throughput * escaped;
            break;
          }

          if (bounce == 0u) {
            primaryDistance = hit.dist;
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
          let shadowOrigin = hitPoint + normal * 0.025;
          // Lambertian BRDF normalization, matching Three's raster lights.
          let diffuse = throughput * baseColor * (1.0 - metalness) * 0.31830988618;

          // ---- Direct sun. The cone spread is the solar angular radius, so
          // contact shadows stay sharp and 200 m shadows go properly soft.
          // The raster rig keeps a below-horizon sun burning as a cheap
          // twilight fill; here the last direct light has to die exactly as
          // the disc goes under, or dusk lights the desert from underneath.
          let sunAboveHorizon = smoothstep(-0.035, 0.02, sunDirection.y);
          let directSun = sunIntensity * sunAboveHorizon;
          if (directSun > 0.002) {
            let sampledSun = sampleConeDirection(sunDirection, 0.0075, &randomState);
            let sunCosine = max(dot(normal, sampledSun), 0.0);
            if (sunCosine > 0.0) {
              var shadowRay: Ray;
              shadowRay.origin = shadowOrigin;
              shadowRay.direction = sampledSun;
              var shadowHit: IntersectionResult;
              bvh_RaycastFirstHit(shadowRay, &shadowHit);
              if (!shadowHit.didHit) {
                radiance += diffuse * sunColor * directSun * sunCosine;
              }
            }
          }

          // ---- Direct moonlight, which is the only key light after dusk.
          if (moonIntensity > 0.0005) {
            let sampledMoon = sampleConeDirection(moonDirection, 0.0085, &randomState);
            let moonCosine = max(dot(normal, sampledMoon), 0.0);
            if (moonCosine > 0.0) {
              var moonRay: Ray;
              moonRay.origin = shadowOrigin;
              moonRay.direction = sampledMoon;
              var moonHit: IntersectionResult;
              bvh_RaycastFirstHit(moonRay, &moonHit);
              if (!moonHit.didHit) {
                radiance += diffuse * moonColor * moonIntensity * moonCosine;
              }
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

          ray.origin = shadowOrigin;

          if (bounce >= 2u) {
            let survival = clamp(max(throughput.r, max(throughput.g, throughput.b)), 0.12, 0.92);
            if (hashRandom(&randomState) > survival) {
              break;
            }
            throughput /= survival;
          }
        }

        // ---- Aerial perspective. Everything the camera sees dissolves toward
        // exactly the sky colour behind it, which is what separates the
        // horizon mesas from the monument and carries the dusk colour into
        // the landscape.
        if (primaryDistance > 0.0) {
          let inScatter = scatteringColor(
            viewDirection,
            sunDirection,
            skyColor,
            groundColor,
            skyIntensity,
            moonDirection,
            moonIntensity
          );
          let haze = 1.0 - exp(-primaryDistance * aerialDensity);
          radiance = mix(radiance, inScatter, clamp(haze, 0.0, 0.94));
        }

        // A degenerate bounce — a grazing specular reflection that normalises
        // a near-zero vector, say — yields a non-finite sample. Every NaN
        // comparison is false, so such a sample slips past the clamp below,
        // and once one lands in the accumulation buffer every later sample
        // averages against it and the pixel is white forever. Longer paths hit
        // this often enough that five bounces rendered a blank frame.
        radiance = select(vec3f(0.0), radiance, radiance == radiance);
        radiance = max(radiance, vec3f(0.0));

        // Clamp the very brightest paths. A single specular chain onto the sun
        // disc otherwise leaves a permanent white pixel in a 200-sample frame.
        let peak = max(radiance.r, max(radiance.g, radiance.b));
        if (peak > 40.0) {
          radiance = radiance * (40.0 / peak);
        }

        let previous = textureLoad(previousTex, vec2u(indexUV), 0).rgb;
        let weight = 1.0 / f32(sampleIndex + 1u);
        let accumulated = mix(previous, radiance, weight);
        textureStore(outputTex, indexUV, vec4f(accumulated, 1.0));
      }
    `,[P,F,ge,_e,g(`
      fn environmentRadiance(
        direction: vec3f,
        sunDirection: vec3f,
        sunColor: vec3f,
        sunIntensity: f32,
        skyColor: vec3f,
        groundColor: vec3f,
        skyIntensity: f32,
        moonDirection: vec3f,
        moonColor: vec3f,
        moonAmount: f32,
        celestialPhase: f32,
        polarisAxis: vec3f
      ) -> vec3f {
        let sunElevation = sunDirection.y;
        let nightMix = 1.0 - smoothstep(-0.20, 0.02, sunElevation);
        let dayMix = smoothstep(0.02, 0.26, sunElevation);
        let duskMix = clamp(1.0 - nightMix - dayMix, 0.0, 1.0);
        let litMix = clamp(dayMix + duskMix, 0.0, 1.0);
        let skyMask = smoothstep(-0.06, 0.10, direction.y);
        let sunFacing = max(dot(direction, sunDirection), 0.0);

        var atmosphere = scatteringColor(
          direction,
          sunDirection,
          skyColor,
          groundColor,
          skyIntensity,
          moonDirection,
          moonAmount
        );

        // Two differently scaled density fields give the clouds a layered,
        // volumetric silhouette without adding another scene render pass.
        let broadClouds = cloudFbm(
          direction * vec3f(3.7, 8.5, 3.7) + vec3f(1.4, -0.8, 2.1)
        );
        let fineClouds = cloudFbm(
          direction * vec3f(8.2, 18.0, 8.2) + vec3f(-4.3, 2.7, 1.2)
        );
        let cloudNoise = broadClouds * 0.72 + fineClouds * 0.28;
        let cloudBand = skyMask * (1.0 - smoothstep(0.66, 0.95, direction.y));
        // Sparse high cirrus. Broader coverage grades the whole sky toward the
        // mean grey of the cloud colour and flattens the sunset behind it.
        let cloudDensity = smoothstep(0.53, 0.73, cloudNoise) * cloudBand;
        // Clouds catch the last light from below at dusk, so they stay lit
        // after the ground has gone into shadow.
        let cloudLight = 0.24 + 0.76 * pow(sunFacing, 1.3);
        let dayCloud = mix(vec3f(0.19, 0.23, 0.33), vec3f(1.05, 0.99, 0.91), cloudLight);
        let duskCloud = mix(vec3f(0.13, 0.05, 0.085), vec3f(1.45, 0.46, 0.085), cloudLight);
        let nightCloud = mix(
          vec3f(0.008, 0.011, 0.024),
          vec3f(0.10, 0.12, 0.17),
          cloudLight * moonAmount
        );
        let cloudColor =
          dayCloud * dayMix + duskCloud * duskMix + nightCloud * nightMix;
        // Thin the deck right down after dark: moonlit cloud sits only a
        // little above the night sky's own value, so at full coverage it does
        // nothing but erase the star field.
        let cloudPresence = mix(0.42, 0.95, duskMix) * (1.0 - nightMix * 0.62);
        atmosphere = mix(atmosphere, cloudColor, cloudDensity * cloudPresence * 0.8);
        atmosphere += cloudDensity * duskMix * pow(sunFacing, 5.0) * vec3f(1.5, 0.4, 0.06);

        // ---- Stars and the Milky Way, fading in as the sun goes down. The
        // whole celestial sphere is looked up through a rotation about the
        // Polaris axis: hold it still for a snapshot, or let the caller sweep
        // it across a frame's samples and the accumulation buffer integrates a
        // genuine long exposure, arcs and all.
        let celestial = rotateAboutAxis(direction, polarisAxis, celestialPhase);
        let galacticAxis = normalize(vec3f(0.82, 0.28, -0.50));
        let galacticBand = pow(
          max(1.0 - abs(dot(celestial, galacticAxis)) * 4.2, 0.0),
          2.0
        );
        let milkyTexture = cloudFbm(celestial * 21.0 + vec3f(8.4, -3.1, 6.7));
        let starVeil = nightMix * skyMask * (1.0 - cloudDensity * 0.85);
        atmosphere += vec3f(0.040, 0.060, 0.115) * galacticBand *
          (0.35 + milkyTexture) * starVeil;
        atmosphere += starField(celestial) * starVeil;

        // Polaris, on the axis the whole work is aimed at. It is sampled from
        // the unrotated direction so a long exposure leaves it a fixed point
        // with everything else wheeling around it — which is the photograph
        // the Star Tunnel exists to make.
        let polarisAngle = acos(clamp(dot(direction, polarisAxis), -1.0, 1.0));
        atmosphere +=
          vec3f(1.0, 0.96, 0.86) *
          (1.0 - smoothstep(0.0024, 0.0046, polarisAngle)) * 7.0 * starVeil;
        atmosphere +=
          vec3f(0.85, 0.90, 1.0) * exp(-polarisAngle * 150.0) * 0.55 * starVeil;

        // ---- Sun disc: a real angular size with limb darkening, reddening
        // and dimming through the thick air as it touches the horizon.
        let discOuter = cos(0.0135);
        let discInner = cos(0.0118);
        let discMask = smoothstep(discOuter, discInner, sunFacing);
        let limb = sqrt(max(0.0, 1.0 - pow(clamp(
          acos(clamp(sunFacing, -1.0, 1.0)) / 0.0135, 0.0, 1.0), 2.0)));
        // Thick air near the horizon reddens the disc and takes most of its
        // energy out — a low sun is dimmer as well as oranger.
        let lowSun = 1.0 - smoothstep(-0.02, 0.30, sunElevation);
        let discTint = mix(vec3f(1.0, 0.95, 0.88), vec3f(1.45, 0.42, 0.09), lowSun);
        // No hard horizon cut on the disc: the landscape itself occludes it as
        // it goes down, which is what makes the last sliver read.
        let discEnergy = mix(26.0, 3.6, lowSun) * smoothstep(-0.075, -0.008, sunElevation);
        atmosphere +=
          sunColor * discTint * discMask * (0.35 + 0.65 * limb) *
          sunIntensity * discEnergy;
        // Aureole: three lobes rather than one, so the glow grades away from
        // the limb instead of terminating in a hard bright ring.
        atmosphere +=
          sunColor * discTint * sunIntensity * litMix *
          (pow(sunFacing, 2600.0) * 0.6 +
           pow(sunFacing, 260.0) * 0.14 +
           pow(sunFacing, 30.0) * 0.03);

        // ---- Moon disc and halo.
        let moonFacing = max(dot(direction, moonDirection), 0.0);
        let moonOuter = cos(0.0125);
        let moonInner = cos(0.0104);
        let moonMask = smoothstep(moonOuter, moonInner, moonFacing);
        atmosphere +=
          moonColor * moonAmount *
          (moonMask * 3.2 + pow(moonFacing, 1400.0) * 0.9 + pow(moonFacing, 26.0) * 0.012);

        return atmosphere;
      }
    `,[I,ye,be,g(`
    fn rotateAboutAxis(v: vec3f, axis: vec3f, angle: f32) -> vec3f {
      let c = cos(angle);
      let s = sin(angle);
      return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
    }
  `)]),be,b,yt,y.fns.raycastFirstHit,y.fns.sampleTrianglePoint])(me).computeKernel(xt),R=L.computeNode.parameters,z=a(`vec2`,`vUv`),B=g(`
      fn vertex(position: vec3f, uv: vec2f) -> vec3f {
        varyings.vUv = uv;
        return position;
      }
    `,[z]),V=new ee;V.name=`StarAxis.PathTraceDisplay`,V.positionNode=B({position:p(`position`),uv:p(`uv`)});let H=ie(x[0],z),xe=f(.58),Se=m().sub(.5).length(),Ce=he(1).sub(r(.32,.75,Se).mul(.14));V.colorNode=i(ce(H.rgb.mul(xe),.15).mul(Ce),H.a);let we=new Ee(V),Te=0,U=0,W=0,De=0,G=3,K=new n().copy(t.matrixWorld),q=new n().copy(t.projectionMatrix),Oe=NaN,ke=NaN,Ae=NaN,J=()=>{U=0},Y=()=>{e.getDrawingBufferSize(Ct);let t=Math.max(1,Math.floor(Ct.x)),n=Math.max(1,Math.floor(Ct.y));t===W&&n===De||(W=t,De=n,x.forEach(e=>e.setSize(t,n,1)),J())},X=()=>{t.updateMatrixWorld(),s.updateMatrixWorld(),s.target.updateMatrixWorld(),l.updateMatrixWorld(),l.target.updateMatrixWorld(),Tt.subVectors(s.position,s.target.position).normalize(),Et.subVectors(l.position,l.target.position).normalize();let e=!Dt.equals(Tt)||!Ot.equals(Et)||!kt.equals(s.color)||!At.equals(d.color)||!jt.equals(d.groundColor)||Oe!==s.intensity||ke!==l.intensity||Ae!==d.intensity,n=!K.equals(t.matrixWorld)||!q.equals(t.projectionMatrix);(e||n)&&J(),K.copy(t.matrixWorld),q.copy(t.projectionMatrix),Dt.copy(Tt),Ot.copy(Et),kt.copy(s.color),At.copy(d.color),jt.copy(d.groundColor),Oe=s.intensity,ke=l.intensity,Ae=d.intensity,C.value.copy(t.projectionMatrixInverse),w.value.copy(t.matrixWorld),T.value.copy(Tt),E.value.copy(s.color),D.value=s.intensity,k.value.copy(Et),te.value.copy(l.color),ne.value=l.intensity,ae.value.copy(d.color),A.value.copy(d.groundColor),oe.value=d.intensity;let r=Tt.y,i=Mt(-.24,-.02,r),a=Mt(.03,.28,r);xe.value=1.9+-.95*i+-.37*a};return{render:(t,n)=>{Y(),X();let r=Math.min(5,Math.max(1,Math.round(n)));r!==G&&(G=r,J());let i=Math.min(St,Math.max(1,Math.round(t)));for(let t=0;t<i;t++){let t=+(Te===0),n=R;n.outputTex.value=x[t],n.previousTex.value=x[Te],n.inverseProjectionMatrix.value=C.value,n.cameraToWorldMatrix.value=w.value,n.sunDirection.value=T.value,n.sunColor.value=E.value,n.sunIntensity.value=D.value,n.moonDirection.value=k.value,n.moonColor.value=te.value,n.moonIntensity.value=ne.value,n.skyColor.value=ae.value,n.groundColor.value=A.value,n.skyIntensity.value=oe.value,n.sampleIndex.value=U,n.maxBounceCount.value=r,n.aerialDensity.value=de.value,n.starTrailArc.value=M.value,n.celestialOffset.value=N.value,n.exposureSamples.value=Math.max(i,64),n.polarisAxis.value=ue.value,n.workgroupSize.value.fromArray(xt),e.compute(L,[Math.ceil(W/xt[0]),Math.ceil(De/xt[1])]),Te=t,U++}H.value=x[Te],we.render(e)},reset:J,setStarTrail:e=>{let t=Math.max(0,e);t!==M.value&&(M.value=t,J())},setCelestialRotation:e=>{e!==N.value&&(N.value=e,J())},get samples(){return U}}}export{Ft as createPathTracer};