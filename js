const upload = document.getElementById('upload');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const placeholder = document.getElementById('placeholder');

const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panelTitle');
const panelContent = document.getElementById('panelContent');
const closePanel = document.getElementById('closePanel');
const applyBtn = document.getElementById('applyBtn');
const cancelBtn = document.getElementById('cancelBtn');

const brightnessBtn = document.getElementById('brightnessBtn');
const darkenBtn = document.getElementById('darkenBtn');
const bwBtn = document.getElementById('bwBtn');
const rotateBtn = document.getElementById('rotateBtn');
const resetBtn = document.getElementById('resetBtn');
const saveBtn = document.getElementById('saveBtn');

let originalImageData = null; // imagem base (para previews sempre usar esta)
let currentMode = null;       // 'brightness' | 'darken' | 'bw' | 'rotate'
let currentParams = {};       // parâmetros do filtro atual (slider values)
let loadedImg = null;         // Image() original (para rotações)

// ---- Upload ----
upload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    loadedImg = img;
    // ajusta canvas ao tamanho da imagem
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    placeholder.style.display = 'none';
  };
  img.src = URL.createObjectURL(file);
});

// ---- Utilities ----
function openPanel(mode){
  currentMode = mode;
  panel.classList.remove('hidden');

  // marca botão ativo
  document.querySelectorAll('.tool').forEach(btn => btn.classList.remove('active'));
  if(mode === 'brightness') brightnessBtn.classList.add('active');
  if(mode === 'darken') darkenBtn.classList.add('active');
  if(mode === 'bw') bwBtn.classList.add('active');
  if(mode === 'rotate') rotateBtn.classList.add('active');

  // monta conteúdo dinâmico
  panelContent.innerHTML = ''; // limpar

  if(!originalImageData) {
    panelContent.innerHTML = '<p>Carregue uma imagem primeiro.</p>';
    applyBtn.disabled = true;
    return;
  }
  applyBtn.disabled = false;

  if(mode === 'brightness'){
    panelTitle.textContent = 'Brilho (escala linear nos canais RGB)';
    // matriz: RGB' = k * RGB  => escala por k (matriz k * I3)
    addSlider('Intensidade', 0.0, 3.0, 0.1, 1.2, 'k', (v) => {
      currentParams.k = parseFloat(v);
      previewBrightness(currentParams.k);
    });
    currentParams.k = 1.2;
    previewBrightness(currentParams.k);
  }

  if(mode === 'darken'){
    panelTitle.textContent = 'Escurecer (escala linear nos canais RGB)';
    addSlider('Fator', 0.0, 1.0, 0.01, 0.6, 'k', (v) => {
      currentParams.k = parseFloat(v);
      previewBrightness(currentParams.k);
    });
    currentParams.k = 0.6;
    previewBrightness(currentParams.k);
  }

  if(mode === 'bw'){
    panelTitle.textContent = 'Preto e Branco (combinação linear dos canais)';
    // intensidade 0..1 onde 1 = full BW, 0 = original
    addSlider('Mistura (0 = original, 1 = full BW)', 0.0, 1.0, 0.01, 1.0, 'mix', (v) => {
      currentParams.mix = parseFloat(v);
      previewBW(currentParams.mix);
    });
    currentParams.mix = 1.0;
    previewBW(currentParams.mix);

    // mostrar coeficientes (pode editar se quiser)
    const coefBox = document.createElement('div');
    coefBox.style.fontSize = '12px';
    coefBox.style.color = '#40515a';
    coefBox.style.marginTop = '8px';
    coefBox.innerHTML = `<strong>Coeficientes (Y = r·R + g·G + b·B)</strong>
      <div>r = 0.299, g = 0.587, b = 0.114 (padrão)</div>`;
    panelContent.appendChild(coefBox);
  }

  if(mode === 'rotate'){
    panelTitle.textContent = 'Rotação (transformação linear nas coordenadas)';
    // rotação é uma transformação linear nas coordenadas (x,y) via matriz:
    // R(θ) = [[cosθ, -sinθ], [sinθ, cosθ]]
    addSlider('Ângulo (graus)', -180, 180, 1, 0, 'deg', (v) => {
      currentParams.deg = parseFloat(v);
      previewRotation(currentParams.deg);
    });
    currentParams.deg = 0;
    previewRotation(0);

    const tip = document.createElement('div');
    tip.style.marginTop = '8px';
    tip.style.fontSize = '12px';
    tip.style.color = '#40515a';
    tip.innerText = 'A rotação é aplicada mantendo o canvas no mesmo tamanho; elementos cortados nas bordas podem aparecer.';
    panelContent.appendChild(tip);
  }
}

function closeAndResetPanel(){
  panel.classList.add('hidden');
  document.querySelectorAll('.tool').forEach(btn => btn.classList.remove('active'));
  currentMode = null;
  panelContent.innerHTML = '';
  if(originalImageData) ctx.putImageData(originalImageData, 0, 0);
}

/* cria uma linha de controle com slider */
function addSlider(label, min, max, step, value, name, oninput){
  const row = document.createElement('div');
  row.className = 'control-row';
  const labelRow = document.createElement('div');
  labelRow.className = 'label-row';
  const lbl = document.createElement('div'); lbl.textContent = label;
  const valSpan = document.createElement('div'); valSpan.textContent = value;
  labelRow.appendChild(lbl); labelRow.appendChild(valSpan);
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = value;
  slider.addEventListener('input', (e) => { valSpan.textContent = e.target.value; oninput(e.target.value); });
  row.appendChild(labelRow); row.appendChild(slider);
  panelContent.appendChild(row);
}

/* ---- Preview / filtros ---- */
/* Trabalhamos sempre a partir da originalImageData para preview, evitando composições acumuladas. */

function previewBrightness(k){
  if(!originalImageData) return;
  const src = originalImageData;
  const out = new ImageData(src.width, src.height);
  const s = src.data, d = out.data;
  // operação linear por escalar k: [R',G',B'] = k * [R,G,B]
  for(let i=0;i<s.length;i+=4){
    d[i]   = clamp(Math.round(s[i]*k));   // R
    d[i+1] = clamp(Math.round(s[i+1]*k)); // G
    d[i+2] = clamp(Math.round(s[i+2]*k)); // B
    d[i+3] = s[i+3]; // alpha
  }
  ctx.putImageData(out, 0, 0);
}

function previewBW(mix){
  // mix: 0 => original, 1 => full grayscale
  if(!originalImageData) return;
  const src = originalImageData;
  const out = new ImageData(src.width, src.height);
  const s = src.data, d = out.data;
  // intensidade padrão linear: Y = 0.299R + 0.587G + 0.114B
  for(let i=0;i<s.length;i+=4){
    const r = s[i], g = s[i+1], b = s[i+2];
    const y = 0.299*r + 0.587*g + 0.114*b;
    // combinação linear entre original e y
    d[i]   = clamp(Math.round((1-mix)*r + mix*y));
    d[i+1] = clamp(Math.round((1-mix)*g + mix*y));
    d[i+2] = clamp(Math.round((1-mix)*b + mix*y));
    d[i+3] = s[i+3];
  }
  ctx.putImageData(out, 0, 0);
}

/* Rotação: desenha em um canvas temporário com rotação aplicada.
   A rotação é uma transformação linear das coordenadas: [x';y'] = R(θ) [x;y]
*/
function previewRotation(deg){
  if(!loadedImg || !originalImageData) return;
  const rad = deg * Math.PI/180;
  // vamos desenhar em um canvas temporário do mesmo tamanho do principal
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const tctx = tmp.getContext('2d');

  // limpar e desenhar com rotação centrada
  tctx.clearRect(0,0,tmp.width,tmp.height);
  tctx.save();
  tctx.translate(tmp.width/2, tmp.height/2);
  tctx.rotate(rad);
  tctx.drawImage(loadedImg, -loadedImg.naturalWidth/2, -loadedImg.naturalHeight/2);
  tctx.restore();

  // copiar pro canvas principal
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(tmp, 0, 0);
}

/* ---- Helpers ---- */
function clamp(v){ return Math.max(0, Math.min(255, v)); }

/* ---- Ações dos botões ---- */
brightnessBtn.addEventListener('click', () => openPanel('brightness'));
darkenBtn.addEventListener('click', () => openPanel('darken'));
bwBtn.addEventListener('click', () => openPanel('bw'));
rotateBtn.addEventListener('click', () => openPanel('rotate'));

closePanel.addEventListener('click', closeAndResetPanel);
cancelBtn.addEventListener('click', closeAndResetPanel);

/* Aplicar: confirma a alteração e atualiza originalImageData */
applyBtn.addEventListener('click', () => {
  if(!originalImageData) return;
  if(currentMode === 'brightness' || currentMode === 'darken'){
    // já está desenhado no canvas (preview); então atualiza originalImageData
    originalImageData = ctx.getImageData(0,0,canvas.width,canvas.height);
  } else if(currentMode === 'bw'){
    originalImageData = ctx.getImageData(0,0,canvas.width,canvas.height);
  } else if(currentMode === 'rotate'){
    // a rotação foi desenhada no canvas; gravamos como nova original
    originalImageData = ctx.getImageData(0,0,canvas.width,canvas.height);
    // atualiza loadedImg também: cria uma imagem nova a partir do canvas para futuras rotações
    const dataURL = canvas.toDataURL();
    const img = new Image();
    img.onload = () => { loadedImg = img; };
    img.src = dataURL;
  }
  // fechar painel
  closeAndResetPanel();
});

/* Reset: volta à original carregada do arquivo (sem alterações aplicadas) */
resetBtn.addEventListener('click', () => {
  if(originalImageData){
    // Redesenha a imagem original (antes de quaisquer "apply")
    const w = originalImageData.width, h = originalImageData.height;
    canvas.width = w; canvas.height = h;
    ctx.putImageData(originalImageData, 0, 0);
  }
});

/* Salvar imagem */
saveBtn.addEventListener('click', () => {
  if(!originalImageData) return;
  const link = document.createElement('a');
  link.download = 'imagem_filtrada.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

