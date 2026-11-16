import { FishRushModel, Gate, RULES } from './FishRushModel';

export type Ink = string;
export type Command = {
    id: string; kind: 'rect' | 'ellipse' | 'polygon' | 'text' | 'image' | 'school';
    x?: number; y?: number; w?: number; h?: number; radius?: number;
    fill?: Ink; stroke?: Ink; line?: number; points?: number[][];
    text?: string; size?: number; bold?: boolean; asset?: 'fish' | 'squirrel'; alpha?: number; tint?: Ink;
    fishGlyphs?: Array<{ x: number; y: number; size: number }>;
};
export type FishVisualUnit = { level: number };
export const FISH_EVOLUTION_BASE = 16;

export function fishVisualUnits(count: number): FishVisualUnit[] {
    let remaining = Math.max(0, Math.floor(count));
    const units: FishVisualUnit[] = [];
    let power = 1;
    let level = 0;
    while (power * FISH_EVOLUTION_BASE <= Math.max(1, remaining) && level < 8) {
        power *= FISH_EVOLUTION_BASE;
        level += 1;
    }
    for (; level >= 0; level--) {
        const value = Math.pow(FISH_EVOLUTION_BASE, level);
        const amount = Math.floor(remaining / value);
        remaining -= amount * value;
        for (let i = 0; i < amount; i++) units.push({ level });
    }
    return units;
}
export const PALETTE = { navy: '#153d59', cream: '#fff6dc', blue: '#2879ef', aqua: '#39d7c2', coral: '#ff6b6b' };
const N = PALETTE.navy;
export const CONTACT_Y = 1000;
export const project = (x: number, depth: number) => {
    const t = Math.max(0, Math.min(1.12, depth));
    const perspective = 0.15 + 0.85 * t * t;
    return { x: 360 + x * 294 * perspective, y: 330 + 670 * t * t, scale: perspective };
};

/** Fish use the same road projection as gates and enemies. World coordinates are
 * then sorted from horizon to camera so front rows occlude rear rows naturally. */
export const schoolProject = (x: number, depth: number, row: number) => {
    const p = project(x, depth);
    // Depth is already assigned per row by composeGame. Keep row as a visual
    // bob offset only; adding it to depth would cancel the school perspective.
    return { x: p.x, y: p.y + row * 2 * p.scale, scale: p.scale };
};

/** Shared display list: the Cocos and browser previews render identical artwork and rules. */
export function composeGame(m: FishRushModel): Command[] {
    const c: Command[] = [];
    const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, radius = 0, stroke?: string, line = 3) =>
        c.push({ id, kind: 'rect', x, y, w, h, fill, radius, stroke, line });
    const oval = (id: string, x: number, y: number, w: number, h: number, fill: string) =>
        c.push({ id, kind: 'ellipse', x, y, w, h, fill });
    const poly = (id: string, points: number[][], fill: string, stroke?: string, line = 3) =>
        c.push({ id, kind: 'polygon', points, fill, stroke, line });
    const text = (id: string, value: string, x: number, y: number, size: number, fill = N, bold = true) =>
        c.push({ id, kind: 'text', x, y, w: 700, h: size * 1.6, text: value, size, fill, bold });
    const sprite = (id: string, asset: 'fish' | 'squirrel', x: number, y: number, w: number, h = w, tint?: string) =>
        c.push({ id, kind: 'image', asset, x, y, w, h, tint });

    rect('sky', 360, 640, 720, 1280, '#b4ebf4');
    oval('sunGlow', 586, 248, 160, 160, '#c9f2ed');
    oval('sun', 586, 248, 99, 99, '#fff1b0');
    for (let i = 0; i < 4; i++) {
        const x = ((i * 217 + m.clock * 3) % 940) - 110;
        oval(`cloudA${i}`, x, 219 + (i % 2) * 62, 108, 30, '#efffff');
        oval(`cloudB${i}`, x + 18, 204 + (i % 2) * 62, 56, 48, '#efffff');
    }
    poly('islandsBack', [[0,344],[0,300],[80,284],[140,308],[211,277],[282,322],[442,307],[520,284],[600,309],[720,277],[720,350]], '#71c8ba');
    poly('islandsFront', [[0,373],[0,334],[86,314],[150,340],[222,325],[278,351],[462,345],[546,329],[620,347],[720,315],[720,380]], '#49af9d');
    rect('ocean', 360, 834, 720, 932, '#67d6d6');
    poly('sandLeft', [[0,363],[307,330],[30,1280],[0,1280]], '#f7dfa0');
    poly('sandRight', [[413,330],[720,363],[720,1280],[690,1280]], '#f7dfa0');
    poly('channelBorder', [[307,330],[413,330],[780,1280],[-60,1280]], '#258fad');
    poly('channel', [[314,330],[406,330],[755,1280],[-35,1280]], '#47c5df');
    poly('channelLight', [[322,330],[350,330],[282,1280],[30,1280]], '#61d6e6');
    poly('channelRight', [[387,330],[406,330],[755,1280],[630,1280]], '#36b5d3');
    // Flowing ripples follow the same perspective as encounters.
    for (let i = 0; i < 17; i++) {
        const d = ((i / 17 + m.clock * (m.phase === 'playing' ? 0.10 : 0.025)) % 1.18);
        const p = project(((i * 73) % 100) / 60 - 0.8, d);
        oval(`ripple${i}`, p.x, p.y, 34 * p.scale, 4 * p.scale, '#a5edf0');
    }
    // Shore props: rounded boulders, coral and palms, drawn as 2D silhouettes.
    for (let i = 0; i < 10; i++) {
        const d = ((i / 10 + m.clock * (m.phase === 'playing' ? 0.065 : 0.012)) % 1.1);
        const side = i % 2 ? -1 : 1;
        const p = project(side * 1.43, d);
        const s = p.scale;
        oval(`rockShadow${i}`, p.x, p.y + 9 * s, 79 * s, 19 * s, '#d8bd7e');
        oval(`rock${i}`, p.x, p.y, 63 * s, 45 * s, i % 3 ? '#86b6ab' : '#fb9a88');
        oval(`rockShine${i}`, p.x - 10 * s, p.y - 9 * s, 22 * s, 9 * s, i % 3 ? '#b5d8bf' : '#ffc7a0');
        if (i % 3 === 0) {
            poly(`trunk${i}`, [[p.x-5*s,p.y],[p.x+7*s,p.y],[p.x+17*s,p.y-103*s],[p.x+7*s,p.y-108*s]], '#bd8855');
            for (let j=0;j<4;j++) {
                const dx = (j < 2 ? -1 : 1) * (42 + j % 2 * 17) * s;
                poly(`leaf${i}-${j}`, [[p.x+13*s,p.y-104*s],[p.x+dx,p.y-(125-j%2*36)*s],[p.x+dx*0.8,p.y-(108-j%2*30)*s]], j%2 ? '#239c86' : '#39bc8a');
            }
        }
    }
    if (m.phase === 'playing' && m.elapsed > 54) {
        const y = project(0, Math.min(1, (m.elapsed-54)/6)).y;
        rect('finish', 360, y, 500 * project(0,(m.elapsed-54)/6).scale, 12, '#fff6dc');
    }
    const gateLabel = (g: Gate) => `${g.kind === 'mul' ? '×' : '+'}${g.value}`;
    for (const e of [...m.encounters].sort((a,b) => a.depth-b.depth)) {
        const p = project(e.x, e.depth), s = p.scale;
        if (e.kind === 'gate') {
            for (let half = 0; half < 2; half++) {
                const g = e.gates![half];
                const q = project(half === 0 ? -0.51 : 0.51, e.depth);
                const x = q.x, y = q.y;
                const color = g.kind === 'mul' ? '#437df1' : '#13b99d';
                const width = 274*s, height = 152*s;
                oval(`gshadow${e.id}-${half}`, x, y + 13*s, width, 24*s, '#2699b2');
                rect(`gback${e.id}-${half}`, x, y-height/2, width, height, color, 18*s, N, Math.max(1,4*s));
                rect(`gshine${e.id}-${half}`, x, y-height+15*s, width-20*s, 8*s, g.kind==='mul' ? '#91c0ff' : '#8ff5cf', 4*s);
                rect(`gpoleL${e.id}-${half}`, x-width/2+7*s, y-8*s, 14*s, 44*s, '#fff4ce', 4*s, N, 2*s);
                rect(`gpoleR${e.id}-${half}`, x+width/2-7*s, y-8*s, 14*s, 44*s, '#fff4ce', 4*s, N, 2*s);
                text(`gt${e.id}-${half}`, gateLabel(g), x, y-height*0.58, Math.max(10,61*s), '#ffffff');
                if(s>0.25) text(`gh${e.id}-${half}`, g.kind==='mul'?'鱼群翻倍':'伙伴加入', x, y-height*0.22, Math.max(8,18*s), '#e6ffff');
            }
        } else {
            const boss = e.kind==='boss';
            const groupCount = boss ? 1 : Math.max(1, Math.floor(e.cost));
            const groupScale = boss ? 1 : Math.min(1, 280 / Math.max(280, groupCount * 82));
            const w = (boss ? 265 : 152) * s * groupScale;
            oval(`eshadow${e.id}`, p.x, p.y+10*s, Math.max(w*0.78, groupCount*52*s*groupScale), 24*s, '#2794b2');
            for (let enemyIndex = 0; enemyIndex < groupCount; enemyIndex++) {
                const offset = (enemyIndex - (groupCount - 1) / 2) * 78 * s * groupScale;
                sprite(`enemy${e.id}-${enemyIndex}`, 'squirrel', p.x + offset, p.y-w*0.44+Math.sin(m.clock*6+e.id+enemyIndex)*5*s, w);
            }
            rect(`ebadge${e.id}`, p.x, p.y-w*0.91, (boss?230:125)*s, 41*s, boss?'#713f75':'#d95060', 14*s, '#fff6dc', 2*s);
            text(`et${e.id}`, `${boss?'首领 ':''}−${e.cost}`, p.x, p.y-w*0.91, Math.max(10,24*s), '#fff6dc');
        }
    }
    // The logical count is exact. The school has at most six rows; once all
    // slots are occupied, additional fish stack in the same slots with a small
    // offset so the player can still read the growing mass without losing the map.
    const visualUnits = fishVisualUnits(m.fish);
    const visible = visualUnits.length;
    const columns = Math.min(14, Math.max(5, Math.ceil(Math.sqrt(visible * 1.35 || 1))));
    const maxRows = 6;
    const rows = Math.max(1, Math.min(maxRows, Math.ceil(visible / columns)));
    const slots = Math.max(1, columns * rows);
    // Fit the whole logical school into the playable water. Sprite size and row
    // spacing shrink together as the school grows; every fish still gets a draw call.
    const schoolScale = Math.min(1, 520 / (columns * 72), 570 / (rows * 45));
    const leader = project(m.x, 1.04);
    const fishCommands: { depth: number; command: Command }[] = [];
    for (let i=0;i<visible;i++) {
        const slot = i % slots;
        const stack = Math.floor(i / slots);
        const unitLevel = visualUnits[i].level;
        const row = Math.floor(slot/columns), col = slot%columns;
        const rowCount = Math.min(columns,visible-row*columns);
        const lane = m.x + (col-(rowCount-1)/2) * 0.105 * schoolScale;
        // Row zero is closest to the camera. Older rows recede into the map.
        const depth = Math.max(0.70, Math.min(1.08, 1.04 - row * 0.018));
        const p = schoolProject(lane, depth, row);
        const visualScale = p.scale * schoolScale * (1 + unitLevel * 0.46) * Math.max(0.72, 1 - stack * 0.06);
        const bob = Math.sin(m.clock*5+i*0.8)*4*visualScale;
        const stackOffset = (stack % 2 === 0 ? -1 : 1) * Math.ceil(stack / 2) * 7 * schoolScale;
        if (unitLevel > 0) {
            const glow = unitLevel === 1 ? '#7fdcff' : unitLevel === 2 ? '#ffc95f' : '#ff86d8';
            fishCommands.push({ depth: depth - 0.001, command: { id:`fishGlow${i}`, kind:'ellipse', x:p.x+stackOffset, y:p.y+3*visualScale, w:92*visualScale, h:92*visualScale, fill:glow } });
        }
        fishCommands.push({ depth: depth + stack * 0.001, command: { id:`fshadow${i}`, kind:'ellipse', x:p.x+stackOffset, y:p.y+24*visualScale, w:48*visualScale, h:12*visualScale, fill:'#268faf' } });
        fishCommands.push({ depth: depth + 0.001 + stack * 0.001, command: { id:`fish${i}`, kind:'image', asset:'fish', x:p.x+stackOffset, y:p.y-10*visualScale+bob, w:68*visualScale, h:68*visualScale, tint: unitLevel === 0 ? '#ffffff' : unitLevel === 1 ? '#bcecff' : unitLevel === 2 ? '#ffe7a3' : '#ffc4ee' } });
    }
    fishCommands.sort((a,b)=>a.depth-b.depth).forEach(({command})=>c.push(command));
    rect('countShadow',leader.x,1134,152,48,'#1e718d',18);
    rect('count',leader.x,1128,152,48,'#fff6dc',18,N,3);
    text('countText',`${m.fish} 伙伴`,leader.x,1127,23);
    for (const f of m.feedback) {
        const x = project(f.x,1).x;
        const y = 859-(1.35-f.life)*65;
        text(`feedbackShadow${f.id}`,f.text,x+2,y+3,27,N);
        text(`feedback${f.id}`,f.text,x,y,27,f.good?'#fff5a9':'#ffe0e3');
    }
    // Cream cards and dark outlines keep the HUD legible on a bright world.
    rect('topShadow',360,70,660,90,'#67bfc8',25);
    rect('top',360,63,660,90,'#fff6dc',25,N,3);
    text('brand','DEEPSEA',149,48,27);
    text('brandSub','肥鱼大冒险',149,80,19,'#5e8c94');
    text('chapter',`海岛水道  ${String(m.stage).padStart(2,'0')}`,393,49,22);
    text('time',m.phase==='playing'?`${Math.max(0,Math.ceil(60-m.elapsed))}s`:'集结 · 出发',393,80,18,'#5e8c94');
    rect('scorePill',607,63,122,62,'#ffdf7f',17);
    text('scoreTitle','得分',607,47,15);
    text('score',`${m.score}`,607,73,24);
    rect('progressBack',360,130,630,10,'#8cccd3',5);
    const progress = Math.max(0.02, Math.min(1,m.elapsed/60));
    rect('progress',45+630*progress/2,130,630*progress,10,'#fff6dc',5);
    text('routeTitle','集结鱼群  /  选择更强增益门  /  躲开飞飞鼠首领',360,165,18,N,false);
    rect('bottom',360,1231,670,58,'#fff6dc',20,N,3);
    text('bottomText',m.phase==='playing'?'←  左右滑动选择增益门  →':'DEEPSEEK 鱼群  ×  FAKER 飞鼠',360,1231,20);
    if (m.phase !== 'playing') {
        rect('scrim',360,640,720,1280,'#123a5b80');
        rect('modalShadow',360,658,604,626,'#163c63',32);
        rect('modal',360,643,604,626,'#fff6dc',32,N,4);
        rect('tag',360,368,228,38,'#ffdb79',15);
        text('tagText','OCEAN SQUAD RUN',360,368,17);
        const ready=m.phase==='ready', won=m.phase==='won';
        text('modalTitle',ready?'肥鱼，集合！':won?'漂亮！突围成功':'鱼群需要你',360,430,44);
        text('modalSubtitle',ready?'小小肥鱼，也能掀起大浪':won?'下一片海域，继续壮大队伍':'再选一次，组建更强的鱼群',360,480,21,'#5e8c94',false);
        sprite('modalFish','fish',291,586,180);
        sprite('modalEnemy','squirrel',458,591,147);
        text('vs','VS',375,581,24,'#d56c58');
        if(ready) {
            text('rule1','×2 翻倍鱼群    +2 加入两位伙伴',360,706,22);
            text('rule2','碰撞消耗伙伴 · 避开红色飞鼠 · 留足首领战力',360,750,18,'#5e8c94',false);
        } else {
            text('result',`得分 ${m.score}    最大鱼群 ${m.peakFish}`,360,704,25);
            text('resultHint',won?`剩余 ${m.fish} 位伙伴 · 第 ${m.stage} 关完成`:'鱼群归零 · 试着选择翻倍门并绕开敌人',360,749,19,'#5e8c94',false);
        }
        rect('buttonShadow',360,866,472,86,'#147d78',24,N,3);
        rect('button',360,855,472,86,'#39d7b6',24,N,3);
        text('buttonText',ready?'出发，冲向大海！':won?'前往下一海域  →':'重新集结  ↻',360,854,29);
        text('modalFooter','滑动 / 鼠标移动 / 方向键 均可操控',360,924,17,'#6d9297',false);
    }
    return c;
}
