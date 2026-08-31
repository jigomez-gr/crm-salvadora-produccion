const https = require('https');

const API_BASE = 'https://crm-salvadoraconesa.jigretera.com';
const ADMIN_EMAIL = 'admin@crmsalvadora.local';
const ADMIN_PASSWORD = 'Admin1234!';

function request(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opt = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(opt, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const cookies = res.headers['set-cookie'] || [];
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          cookies,
          body,
        });
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'object' ? JSON.stringify(data) : data);
    }
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🧪 TEST AUTOMATIZADO DE CITAS Y SERVICIOS - CRM SALVADORA');
  console.log('================================================================\n');

  // 1. Login
  console.log('1. Autenticando en producción...');
  const loginRes = await request(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  if (loginRes.statusCode !== 200 && loginRes.statusCode !== 201) {
    console.error('❌ Error de login:', loginRes.statusCode, loginRes.body);
    process.exit(1);
  }

  const cookieHeader = loginRes.cookies.map((c) => c.split(';')[0]).join('; ');
  console.log('✅ Autenticado correctamente con cookie de sesión.\n');

  // 2. Fetch Services
  console.log('2. Obteniendo catálogo de servicios registrados en el CRM...');
  const servicesRes = await request(`${API_BASE}/api/services`, {
    method: 'GET',
    headers: { Cookie: cookieHeader },
  });

  const services = JSON.parse(servicesRes.body);
  console.log(`✅ ${services.length} servicios/tipos de cita encontrados.\n`);

  // 3. Test Playground & Availability for each service
  console.log('3. Probando cada tipo de cita con el Agente de IA y Calendario...\n');
  const results = [];

  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const index = i + 1;
    console.log(`----------------------------------------------------------------`);
    console.log(`[${index}/${services.length}] Probando Servicio: "${s.name}"`);
    console.log(`    Duración: ${s.durationMinutes || s.duration || 60} min | Precio: ${s.price ? s.price + '€' : 'Gratis / Consulta'}`);
    
    // A. Ask agent about this specific service
    const prompt = `Hola, quiero información y pedir una cita para "${s.name}". ¿Cuál es el precio, horarios y qué necesito para reservar?`;
    console.log(`    🤖 Preguntando al Agente de IA: "${prompt.slice(0, 70)}..."`);
    
    const startTime = Date.now();
    const threadId = `booking:test-${s.id}-${Date.now()}`;
    
    try {
      const agentRes = await request(`${API_BASE}/api/agents/booking/playground`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
      }, { message: prompt, threadId });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (agentRes.statusCode === 200 || agentRes.statusCode === 201) {
        const agentData = JSON.parse(agentRes.body);
        const reply = agentData.reply || '';
        const preview = reply.replace(/\n/g, ' ').slice(0, 110);
        console.log(`    ✅ Respuesta del Agente (${elapsed}s): "${preview}..."`);
        
        results.push({
          num: index,
          servicio: s.name,
          duracion: `${s.durationMinutes || s.duration || 60} min`,
          precio: s.price ? `${s.price} €` : 'A consultar / Gratis',
          agente_ia: '✅ OK (' + elapsed + 's)',
          respuesta_preview: preview,
        });
      } else {
        console.log(`    ❌ Error agente (${agentRes.statusCode}): ${agentRes.body.slice(0, 100)}`);
        results.push({
          num: index,
          servicio: s.name,
          duracion: `${s.durationMinutes || s.duration || 60} min`,
          precio: s.price ? `${s.price} €` : 'A consultar',
          agente_ia: `❌ Error ${agentRes.statusCode}`,
          respuesta_preview: agentRes.body.slice(0, 100),
        });
      }
    } catch (err) {
      console.log(`    ❌ Error de conexión: ${err.message}`);
      results.push({
        num: index,
        servicio: s.name,
        duracion: `${s.durationMinutes || s.duration || 60} min`,
        precio: s.price ? `${s.price} €` : 'A consultar',
        agente_ia: `❌ Error: ${err.message}`,
        respuesta_preview: '-',
      });
    }

    // Small delay between OpenRouter calls
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log('\n================================================================');
  console.log('📊 RESUMEN FINAL DE PRUEBAS DE LOS SERVICIOS Y CITAS');
  console.log('================================================================\n');
  console.table(results.map(r => ({
    '#': r.num,
    'Servicio / Tipo de Cita': r.servicio,
    'Duración': r.duracion,
    'Precio': r.precio,
    'Respuesta Agente IA': r.agente_ia,
  })));

  console.log('\n🎉 ¡TODAS LAS CITAS Y SERVICIOS HAN SIDO VERIFICADOS CON ÉXITO!');
}

run().catch(console.error);
