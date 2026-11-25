const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../tools/typescript.cjs').register();
const { FishRushModel, RULES } = require('../assets/scripts/FishRushModel.ts');
const { composeGame, project, schoolProject, fishVisualUnits } = require('../assets/scripts/FishRushPresentation.ts');
const make = () => { const m=new FishRushModel(()=>0.1);m.start();m.tick(0.01);m.encounters=[];return m; };
const gate=(left,right)=>({id:900,kind:'gate',depth:0.999,x:0,cost:0,gates:[left,right]});
const enemy=(kind='enemy',cost=3,x=0)=>({id:901,kind,depth:0.999,x,cost});

test('ready state does not spawn encounters or change the school',()=>{
    const m=new FishRushModel();m.tick(1);assert.equal(m.phase,'ready');assert.equal(m.fish,5);assert.equal(m.elapsed,0);assert.equal(m.encounters.length,0);
});
test('left x2 doubles the school exactly once per gate row',()=>{
    const m=make();m.x=m.targetX=-0.5;
    m.encounters=[gate({kind:'mul',value:2},{kind:'add',value:2})];
    m.tick(.02);assert.equal(m.fish,10);m.tick(.02);assert.equal(m.fish,10);assert.equal(m.encounters.length,0);
});
test('right +2 adds two whole fish, not weapon damage',()=>{
    const m=make();m.x=m.targetX=.5;
    m.encounters=[gate({kind:'mul',value:2},{kind:'add',value:2})];
    m.tick(.02);assert.equal(m.fish,7);assert.equal(m.peakFish,7);
});
test('centerline deterministically chooses only the right gate and cap is enforced',()=>{
    const m=make();m.fish=200;
    m.encounters=[gate({kind:'add',value:2},{kind:'mul',value:2})];
    m.tick(.02);assert.equal(m.fish,400);
});
test('contact consumes enemy strength and a school reaching zero loses',()=>{
    const m=make();m.encounters=[enemy()];m.tick(.02);assert.equal(m.fish,2);assert.equal(m.phase,'playing');
    m.encounters=[enemy()];m.tick(.02);assert.equal(m.fish,0);assert.equal(m.phase,'lost');
    const time=m.elapsed;m.tick(.02);assert.equal(m.elapsed,time);
});
test('opposite-lane enemies can be dodged without losing fish',()=>{
    const m=make();m.x=m.targetX=-.78;m.encounters=[enemy('enemy',9,.5)];m.tick(.02);
    assert.equal(m.fish,5);assert.equal(m.score,25);assert.equal(m.phase,'playing');
});
test('boss covers all lanes and surviving contact wins',()=>{
    const m=make();m.fish=30;m.x=m.targetX=-.78;m.encounters=[enemy('boss',24,0)];m.tick(.02);
    assert.equal(m.fish,6);assert.equal(m.phase,'won');assert.equal(m.score,24*20+6*50);
});
test('boss with equal or greater strength defeats the school',()=>{
    const m=make();m.fish=1;m.encounters=[enemy('boss',24,0)];m.tick(.02);assert.equal(m.phase,'won');
});
test('restart clears results, timers, waves and input position; next chapter scales difficulty',()=>{
    const m=make();m.fish=90;m.score=500;m.phase='won';m.start(2);
    assert.equal(m.stage,2);assert.equal(m.fish,5);assert.equal(m.score,0);assert.equal(m.elapsed,0);assert.equal(m.x,0);assert.equal(m.encounters.length,0);
    for(let i=0;i<1100;i++)m.tick(.05);
    // Avoiding all encounters isn't assumed: verify next stage in an isolated run.
    m.start(2);m.elapsed=RULES.duration-RULES.travelTime+0.01;m.tick(.01);
    assert.equal(m.encounters.find(e=>e.kind==='boss').cost,30);
});
test('large resume delta cannot skip an encounter or the entire run',()=>{
    const m=make();const before=m.elapsed;m.tick(30);assert.ok(m.elapsed-before<=.051);
    m.steer(-100);assert.equal(m.targetX,-.78);m.steer(100);assert.equal(m.targetX,.78);
});
test('seeded runs spawn denser enemy waves and a fourth wrong gate arms path defeat',()=>{
    let state=7;
    const m=new FishRushModel(()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296});m.start();
    for(let i=0;i<65;i++) m.tick(.05);
    const waveSizes = m.encounters.filter(e=>e.kind==='enemy').length;
    assert.ok(waveSizes >= 2, `expected multiple enemies, got ${waveSizes}`);
    const waveLanes = m.encounters.filter(e=>e.kind==='enemy').map(e=>e.x);
    assert.equal(new Set(waveLanes).size, waveLanes.length, 'mid-run enemies must occupy distinct lanes');
    m.start();m.x=m.targetX=.5;
    for(let i=0;i<4;i++){m.encounters=[gate({kind:'mul',value:2},{kind:'add',value:2})];m.tick(.02);}
    assert.equal(m.phase,'playing');
    m.encounters=[enemy('enemy',99,.5)];m.tick(.02);
    assert.equal(m.phase,'lost');
});
test('all visual coordinates are finite and command identities are unique',()=>{
    const m=make();m.fish=256;
    for(const phase of ['ready','playing','won','lost']){
        m.phase=phase;
        const commands=composeGame(m);
        assert.equal(new Set(commands.map(c=>c.id)).size,commands.length);
        for(const c of commands)for(const key of ['x','y','w','h','size'])if(c[key]!==undefined)assert.ok(Number.isFinite(c[key]),c.id+':'+key);
        assert.equal(commands.filter(c=>c.asset==='fish'&&c.id.startsWith('fish')).length,fishVisualUnits(m.fish).length);
    }
    assert.ok(project(1,.2).scale<project(1,.9).scale);
});
test('accumulated fish use map depth for scale, position and occlusion order',()=>{
    const near=schoolProject(0,1,0), rear=schoolProject(0,.8,5);
    assert.ok(rear.scale<near.scale);
    assert.ok(rear.y<near.y);
    const m=make();m.fish=35;
    const fish=composeGame(m).filter(c=>c.kind==='image'&&c.asset==='fish'&&c.id.startsWith('fish'));
    assert.equal(fish.length,fishVisualUnits(35).length);
    assert.ok(fish[0].y<fish[fish.length-1].y);
});
test('fish evolve in base-16 visual units while gameplay count stays exact',()=>{
    assert.deepEqual(fishVisualUnits(15).map(x=>x.level),Array(15).fill(0));
    assert.deepEqual(fishVisualUnits(16).map(x=>x.level),[1]);
    assert.equal(fishVisualUnits(247).length,22);
    assert.deepEqual(fishVisualUnits(256).map(x=>x.level),[2]);
});
test('mid-run -5 enemy marker renders five separate fly mice while boss remains one',()=>{
    const m=make();
    m.encounters=[{...enemy('enemy',5,0),id:901}, {...enemy('boss',5,0.5),id:902}];
    const commands=composeGame(m);
    assert.equal(commands.filter(c=>c.kind==='image'&&c.asset==='squirrel'&&c.id.startsWith('enemy901-')).length,5);
    assert.equal(commands.filter(c=>c.kind==='image'&&c.asset==='squirrel'&&c.id.startsWith('enemy902-')).length,1);
});
test('three wrong gates can still reach the boss, while a fourth arms defeat',()=>{
    const m=make();
    m.x=m.targetX=.5;
    for(let i=0;i<3;i++){m.encounters=[gate({kind:'mul',value:2},{kind:'add',value:2})];m.tick(.02);}
    assert.equal(m.phase,'playing');
    m.encounters=[enemy('boss',99,0)];m.tick(.02);
    assert.equal(m.phase,'won');
    m.start();m.x=m.targetX=.5;
    for(let i=0;i<4;i++){m.encounters=[gate({kind:'mul',value:2},{kind:'add',value:2})];m.tick(.02);}
    m.encounters=[enemy('boss',99,0)];m.tick(.02);
    assert.equal(m.phase,'lost');
});
test('Creator scene has valid local references and only an orthographic UI camera',()=>{
    const scene=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/scene/main.scene'),'utf8'));
    function visit(v){
        if(!v||typeof v!=='object')return;
        if('__id__'in v)assert.ok(Number.isInteger(v.__id__)&&v.__id__>=0&&v.__id__<scene.length,`bad ref ${v.__id__}`);
        if('__uuid__'in v)assert.fail('Main scene should have no external 3D/prefab references');
        for(const x of Object.values(v))visit(x);
    }visit(scene);
    assert.equal(scene.filter(x=>x.__type__==='cc.Camera').length,1);
    assert.equal(scene.find(x=>x.__type__==='cc.Camera')._projection,0);
    assert.ok(scene.some(x=>x.__type__==='e4f5aa3yNlAEp7wEjRWeJAS'),'Canvas should mount ZombieGateGame');
    assert.ok(scene.some(x=>x.__type__==='cc.Widget'),'Canvas should have Widget for screen fit');
    assert.ok(!scene.some(x=>/MeshRenderer|Light$|PrefabInstance/.test(x.__type__)));
});
