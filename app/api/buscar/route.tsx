import { NextResponse } from 'next/server';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// CORREÇÃO 1: Ativa o disfarce apenas UMA vez, quando o servidor inicia (Fora do POST)
chromium.use(StealthPlugin());

// =========================================================================
// FIREWALL DE SEGURANÇA (CORS)
// =========================================================================
// CORREÇÃO 2: Removida a barra (/) no final. O cabeçalho Origin nunca usa barra!
const DOMINIO_PERMITIDO = 'https://tcg-one-piece-8lh6o4cd6-gustavovolps-projects.vercel.app'; 

const corsHeaders = {
  'Access-Control-Allow-Origin': DOMINIO_PERMITIDO,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Rota OPTIONS é exigida pelos navegadores para liberar requisições de outros domínios
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

interface RequisicaoBusca {
  nome: string;
  codigo?: string;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin') || '';
    if (origin !== DOMINIO_PERMITIDO && origin !== 'http://localhost:3000') {
      return NextResponse.json({ error: 'Acesso bloqueado pelo Firewall local.' }, { status: 403, headers: corsHeaders });
    }

    const body: RequisicaoBusca = await request.json();
// ... O resto do seu código continua EXATAMENTE igual daqui para baixo
    const { nome, codigo } = body;

    if (!nome) {
      return NextResponse.json({ error: 'O nome é obrigatório' }, { status: 400, headers: corsHeaders });
    }

    const nomeLimpoParaBusca = nome.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();

    chromium.use(StealthPlugin());

    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-web-security'] 
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    const page = await context.newPage();

    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const termoUrl = encodeURIComponent(nomeLimpoParaBusca);
    const listaFinal: { htmlRaw: string }[] = [];
    let numeroPagina = 1;

    while (true) {
      const urlBusca = `https://www.ligaonepiece.com.br/?view=cards/search&card=${termoUrl}&page=${numeroPagina}`;
      await page.goto(urlBusca, { waitUntil: 'domcontentloaded' });

      try {
        await page.waitForSelector('.price-min', { timeout: 8000 });
      } catch (e) {
        break; 
      }

      const mtgPrices = page.locator('.mtg-prices');
      const blocosDeCarta = await mtgPrices.evaluateAll(elements => elements.map(el => el.parentElement?.innerHTML || ""));

      if (blocosDeCarta.length === 0) break;

      for (const htmlBloco of blocosDeCarta) {
        if (!htmlBloco) continue;
        const textoLower = htmlBloco.toLowerCase();

        if (!textoLower.includes(nomeLimpoParaBusca.toLowerCase())) continue; 
        if (codigo && !textoLower.includes(codigo.toLowerCase().trim())) continue; 

        listaFinal.push({ htmlRaw: htmlBloco });
      }

      numeroPagina++;
      if (numeroPagina > 15) break; 
    }

    const resultadosFormatados = await page.evaluate((cartas) => {
      return cartas.map(c => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(c.htmlRaw, 'text/html');
        const textoBloco = doc.body.innerText || "";
        const linhas = textoBloco.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const precoMin = doc.querySelector('.price-min')?.textContent?.trim() || "R$ --,--";
        
        const imgEl = doc.querySelector('img.main-card');
        let urlImg = "Sem imagem";
        if (imgEl) {
          const linkBruto = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || "";
          urlImg = linkBruto.startsWith('//') ? `https:${linkBruto}` : linkBruto;
        }

        const descricao = linhas.slice(0, 3).filter(l => !l.includes('R$')).join(' | ');
        return { descricao, preco: precoMin, imagem: urlImg };
      });
    }, listaFinal);

    await browser.close();

    // Retorna os dados com os cabeçalhos de segurança para a Vercel aceitar
    return NextResponse.json({ cartas: resultadosFormatados }, { headers: corsHeaders });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500, headers: corsHeaders });
  }
}