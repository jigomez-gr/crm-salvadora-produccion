/**
 * Generates a realistic high-definition medical radiograph (X-Ray) SVG buffer
 * for Lumbar Spine AP/Lateral examination with clinical overlays and markings.
 */
export function getSampleLumbarRadiographyBuffer(): {
  buffer: Buffer;
  filename: string;
  mimeType: string;
} {
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1200" width="1000" height="1200">
  <defs>
    <!-- Radiographic background gradient -->
    <radialGradient id="filmGlow" cx="50%" cy="50%" r="65%">
      <stop offset="0%" stop-color="#141f2e"/>
      <stop offset="60%" stop-color="#0a0f18"/>
      <stop offset="100%" stop-color="#030508"/>
    </radialGradient>

    <!-- Bone density gradients -->
    <linearGradient id="boneGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7a9ab5" stop-opacity="0.7"/>
      <stop offset="30%" stop-color="#e2f1fc" stop-opacity="0.95"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="70%" stop-color="#d0e5f5" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#6485a4" stop-opacity="0.7"/>
    </linearGradient>

    <linearGradient id="pelvisGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#b8daf0" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#4a6984" stop-opacity="0.4"/>
    </linearGradient>

    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Film Sheet Background -->
  <rect width="1000" height="1200" fill="url(#filmGlow)"/>

  <!-- Technical Calibration Grid (Subtle) -->
  <g stroke="#1a283a" stroke-width="0.7" opacity="0.4">
    <line x1="50" y1="200" x2="950" y2="200"/>
    <line x1="50" y1="400" x2="950" y2="400"/>
    <line x1="50" y1="600" x2="950" y2="600"/>
    <line x1="50" y1="800" x2="950" y2="800"/>
    <line x1="50" y1="1000" x2="950" y2="1000"/>
    <line x1="250" y1="100" x2="250" y2="1100"/>
    <line x1="500" y1="100" x2="500" y2="1100"/>
    <line x1="750" y1="100" x2="750" y2="1100"/>
  </g>

  <!-- Radiography Header & Patient Info Overlay -->
  <g font-family="Helvetica, Arial, sans-serif">
    <!-- Clinic / Hospital banner -->
    <rect x="40" y="30" width="920" height="75" rx="6" fill="#0d1826" stroke="#22364f" stroke-width="1.5"/>
    <text x="65" y="60" fill="#64b5f6" font-size="16" font-weight="bold" letter-spacing="1.5">HOSPITAL UNIVERSITARIO &amp; SERVICIO DE RADIODIAGNÓSTICO</text>
    <text x="65" y="85" fill="#90caf9" font-size="12">ESTUDIO RADIOLÓGICO DIGITAL DIRECTO (DR) · COLUMNA LUMBAR</text>
    <text x="750" y="60" fill="#e0e0e0" font-size="12" font-weight="bold">ID RX: #2026-RX-8491</text>
    <text x="750" y="80" fill="#90caf9" font-size="11">SALA: DR-03 · 75kVp 32mAs</text>

    <!-- Patient Details Banner -->
    <rect x="40" y="115" width="920" height="42" rx="4" fill="#08101a" stroke="#1c2d42" stroke-width="1"/>
    <text x="65" y="141" fill="#ffffff" font-size="13" font-weight="bold">PACIENTE: FERNÁNDEZ, LUCÍA</text>
    <text x="350" y="141" fill="#b0bec5" font-size="12">EDAD: 38 AÑOS · SEXO: F</text>
    <text x="560" y="141" fill="#b0bec5" font-size="12">FECHA: 24/08/2026 09:45</text>
    <text x="780" y="141" fill="#ffd54f" font-size="12" font-weight="bold">PROYECCIÓN: AP + LAT</text>

    <!-- Orientation Markers -->
    <circle cx="900" cy="220" r="24" fill="#0d1826" stroke="#4fc3f7" stroke-width="2"/>
    <text x="893" y="228" fill="#4fc3f7" font-size="22" font-weight="bold">R</text>
    <text x="880" y="260" fill="#81d4fa" font-size="10" font-weight="bold">DERECHA</text>
  </g>

  <!-- ================= RADIOGRAPHIC ANATOMY: LUMBAR SPINE ================= -->
  <g transform="translate(500, 180)" filter="url(#softGlow)">
    <!-- Soft Tissue Shadow -->
    <path d="M -180,50 Q -240,400 -200,800 L 200,800 Q 240,400 180,50 Z" fill="#182535" opacity="0.35"/>

    <!-- T12 (Lower Thoracic) -->
    <g transform="translate(0, 40)">
      <rect x="-65" y="0" width="130" height="45" rx="10" fill="url(#boneGrad)" opacity="0.85"/>
      <ellipse cx="0" cy="22" rx="14" ry="10" fill="#203348" opacity="0.6"/>
      <text x="85" y="28" fill="#81d4fa" font-family="Arial" font-size="12" font-weight="bold">T12</text>
    </g>

    <!-- Intervertebral disc T12-L1 -->
    <rect x="-55" y="90" width="110" height="12" rx="4" fill="#0e1824" opacity="0.8"/>

    <!-- L1 (Lumbar Vertebra 1) -->
    <g transform="translate(0, 106)">
      <rect x="-70" y="0" width="140" height="52" rx="12" fill="url(#boneGrad)"/>
      <ellipse cx="0" cy="26" rx="16" ry="12" fill="#203348" opacity="0.65"/>
      <!-- Transverse processes -->
      <path d="M -70,26 Q -120,20 -130,32 Q -115,40 -70,36" fill="url(#boneGrad)" opacity="0.75"/>
      <path d="M 70,26 Q 120,20 130,32 Q 115,40 70,36" fill="url(#boneGrad)" opacity="0.75"/>
      <text x="90" y="32" fill="#81d4fa" font-family="Arial" font-size="13" font-weight="bold">L1</text>
    </g>

    <!-- Intervertebral disc L1-L2 -->
    <rect x="-62" y="163" width="124" height="14" rx="4" fill="#0e1824" opacity="0.8"/>

    <!-- L2 (Lumbar Vertebra 2) -->
    <g transform="translate(0, 182)">
      <rect x="-76" y="0" width="152" height="56" rx="12" fill="url(#boneGrad)"/>
      <ellipse cx="0" cy="28" rx="18" ry="13" fill="#203348" opacity="0.65"/>
      <!-- Transverse processes -->
      <path d="M -76,28 Q -130,22 -145,35 Q -125,45 -76,38" fill="url(#boneGrad)" opacity="0.75"/>
      <path d="M 76,28 Q 130,22 145,35 Q 125,45 76,38" fill="url(#boneGrad)" opacity="0.75"/>
      <text x="95" y="34" fill="#81d4fa" font-family="Arial" font-size="13" font-weight="bold">L2</text>
    </g>

    <!-- Intervertebral disc L2-L3 -->
    <rect x="-68" y="244" width="136" height="15" rx="4" fill="#0e1824" opacity="0.8"/>

    <!-- L3 (Lumbar Vertebra 3) -->
    <g transform="translate(0, 264)">
      <rect x="-82" y="0" width="164" height="60" rx="14" fill="url(#boneGrad)"/>
      <ellipse cx="0" cy="30" rx="20" ry="14" fill="#203348" opacity="0.65"/>
      <!-- Transverse processes -->
      <path d="M -82,30 Q -145,24 -160,38 Q -140,50 -82,42" fill="url(#boneGrad)" opacity="0.8"/>
      <path d="M 82,30 Q 145,24 160,38 Q 140,50 82,42" fill="url(#boneGrad)" opacity="0.8"/>
      <text x="100" y="36" fill="#81d4fa" font-family="Arial" font-size="13" font-weight="bold">L3</text>
    </g>

    <!-- Intervertebral disc L3-L4 -->
    <rect x="-74" y="330" width="148" height="16" rx="4" fill="#0e1824" opacity="0.8"/>

    <!-- L4 (Lumbar Vertebra 4) -->
    <g transform="translate(0, 352)">
      <rect x="-88" y="0" width="176" height="64" rx="14" fill="url(#boneGrad)"/>
      <ellipse cx="0" cy="32" rx="22" ry="15" fill="#203348" opacity="0.65"/>
      <!-- Transverse processes -->
      <path d="M -88,32 Q -150,26 -162,40 Q -140,52 -88,44" fill="url(#boneGrad)" opacity="0.8"/>
      <path d="M 88,32 Q 150,26 162,40 Q 140,52 88,44" fill="url(#boneGrad)" opacity="0.8"/>
      <text x="105" y="38" fill="#81d4fa" font-family="Arial" font-size="13" font-weight="bold">L4</text>
    </g>

    <!-- ================= CRITICAL RADIOLOGICAL FINDING: L4-L5 PINCHING ================= -->
    <!-- Narrowed Disc Space L4-L5 -->
    <rect x="-78" y="422" width="156" height="8" rx="2" fill="#0a121c" stroke="#ff5252" stroke-width="1.5"/>

    <!-- L5 (Lumbar Vertebra 5) -->
    <g transform="translate(0, 436)">
      <rect x="-92" y="0" width="184" height="66" rx="14" fill="url(#boneGrad)"/>
      <ellipse cx="0" cy="33" rx="24" ry="16" fill="#203348" opacity="0.65"/>
      <!-- Massive L5 transverse processes -->
      <path d="M -92,33 Q -160,30 -170,48 Q -145,62 -92,50" fill="url(#boneGrad)" opacity="0.85"/>
      <path d="M 92,33 Q 160,30 170,48 Q 145,62 92,50" fill="url(#boneGrad)" opacity="0.85"/>
      <text x="110" y="39" fill="#81d4fa" font-family="Arial" font-size="13" font-weight="bold">L5</text>
    </g>

    <!-- L5-S1 Disc space -->
    <rect x="-80" y="508" width="160" height="12" rx="3" fill="#0e1824" opacity="0.85"/>

    <!-- Sacrum & Pelvis (Iliac Crests) -->
    <g transform="translate(0, 526)">
      <!-- Sacrum body -->
      <path d="M -85,0 L 85,0 L 50,220 L -50,220 Z" fill="url(#pelvisGrad)"/>
      <!-- Sacral foramina holes -->
      <circle cx="-25" cy="40" r="7" fill="#121d2a"/>
      <circle cx="25" cy="40" r="7" fill="#121d2a"/>
      <circle cx="-20" cy="80" r="6" fill="#121d2a"/>
      <circle cx="20" cy="80" r="6" fill="#121d2a"/>
      <circle cx="-16" cy="120" r="5" fill="#121d2a"/>
      <circle cx="16" cy="120" r="5" fill="#121d2a"/>
      <text x="65" y="70" fill="#81d4fa" font-family="Arial" font-size="13" font-weight="bold">S1 (Sacro)</text>

      <!-- Iliac Wings (Pelvis) -->
      <path d="M -90,10 Q -240,-40 -300,60 Q -320,180 -240,240 Q -170,260 -75,180 Z" fill="url(#pelvisGrad)" opacity="0.75"/>
      <path d="M 90,10 Q 240,-40 300,60 Q 320,180 240,240 Q 170,260 75,180 Z" fill="url(#pelvisGrad)" opacity="0.75"/>
      <text x="-260" y="100" fill="#90caf9" font-family="Arial" font-size="12">Pala Ilíaca Izq.</text>
      <text x="180" y="100" fill="#90caf9" font-family="Arial" font-size="12">Pala Ilíaca Der.</text>
    </g>
  </g>

  <!-- ================= RADIOLOGIST DIAGNOSTIC CALLOUTS ================= -->
  <g font-family="Helvetica, Arial, sans-serif">
    <!-- Callout on L4-L5 Narrowing -->
    <g transform="translate(240, 608)">
      <line x1="0" y1="0" x2="175" y2="0" stroke="#ff5252" stroke-width="2" stroke-dasharray="4,2"/>
      <circle cx="175" cy="0" r="4" fill="#ff5252"/>
      <rect x="-210" y="-35" width="200" height="58" rx="6" fill="#1c1015" stroke="#ff5252" stroke-width="1.5"/>
      <text x="-200" y="-18" fill="#ff5252" font-size="11" font-weight="bold">HALLAZGO RADIOLÓGICO:</text>
      <text x="-200" y="-2" fill="#ffffff" font-size="10">Pinzamiento discal L4-L5</text>
      <text x="-200" y="13" fill="#ffcdd2" font-size="9">Espacio intersomático disminuido</text>
    </g>

    <!-- Callout on Alignment -->
    <g transform="translate(760, 440)">
      <line x1="0" y1="0" x2="-170" y2="0" stroke="#4fc3f7" stroke-width="1.5" stroke-dasharray="3,2"/>
      <circle cx="-170" cy="0" r="3.5" fill="#4fc3f7"/>
      <rect x="0" y="-25" width="180" height="46" rx="5" fill="#0d1a29" stroke="#4fc3f7" stroke-width="1.2"/>
      <text x="10" y="-8" fill="#4fc3f7" font-size="10" font-weight="bold">EJE RAQUÍDEO:</text>
      <text x="10" y="9" fill="#e1f5fe" font-size="9.5">Alineación coronal conservada</text>
    </g>

    <!-- Calibration / Scale ruler -->
    <g transform="translate(60, 920)">
      <rect x="0" y="0" width="30" height="150" fill="#08101a" stroke="#22364f" stroke-width="1"/>
      <line x1="30" y1="10" x2="18" y2="10" stroke="#90caf9" stroke-width="2"/>
      <line x1="30" y1="35" x2="24" y2="35" stroke="#90caf9" stroke-width="1"/>
      <line x1="30" y1="60" x2="18" y2="60" stroke="#90caf9" stroke-width="2"/>
      <line x1="30" y1="85" x2="24" y2="85" stroke="#90caf9" stroke-width="1"/>
      <line x1="30" y1="110" x2="18" y2="110" stroke="#90caf9" stroke-width="2"/>
      <line x1="30" y1="135" x2="18" y2="135" stroke="#90caf9" stroke-width="2"/>
      <text x="40" y="15" fill="#90caf9" font-size="10">0 cm</text>
      <text x="40" y="65" fill="#90caf9" font-size="10">5 cm</text>
      <text x="40" y="115" fill="#90caf9" font-size="10">10 cm</text>
      <text x="40" y="140" fill="#90caf9" font-size="10">12 cm</text>
    </g>

    <!-- Technical Diagnostic Footer / Stamp -->
    <rect x="40" y="1105" width="920" height="65" rx="6" fill="#0a121c" stroke="#22364f" stroke-width="1.5"/>
    <text x="65" y="1130" fill="#b0bec5" font-size="11">INFORME DE ADQUISICIÓN: Calidad diagnóstica óptima. Dosis acumulada DAP: 1.42 Gy·cm².</text>
    <text x="65" y="1150" fill="#81d4fa" font-size="11" font-weight="bold">CONCLUSIÓN: Signos radiológicos de discopatía degenerativa / pinzamiento sintomático L4-L5 sin evidencia de lisis ni listesis.</text>
    <rect x="760" y="1115" width="185" height="45" rx="4" fill="#0f2137" stroke="#00e676" stroke-width="1"/>
    <text x="775" y="1133" fill="#00e676" font-size="10" font-weight="bold">✓ VALIDADO RADIOLOGÍA</text>
    <text x="775" y="1148" fill="#b9f6ca" font-size="9">Firma Electrónica Médica</text>
  </g>
</svg>`;

  return {
    buffer: Buffer.from(svgContent, 'utf-8'),
    filename: 'radiografia_columna_lumbar.svg',
    mimeType: 'image/svg+xml',
  };
}
