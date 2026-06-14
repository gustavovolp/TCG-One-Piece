import { NextResponse } from 'next/server';
import { chromium } from 'playwright';

interface RequisicaoBusca {
  nome: string;
  codigo?: string;
}

export async function POST(request: Request) {
  try {
    const body: RequisicaoBusca = await request.json();
    const { nome, codigo } = body;

    if (!nome) {
      return NextResponse.json({ error: 'O nome é obrigatório' }, { status: 400 });
    }

    const nomeLimpoParaBusca = nome
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const termoBuscaFinal = nomeLimpoParaBusca;

    // =========================================================================
    // DISFARCE DE ROBÔ E AJUSTE PRO DOCKER/RAILWAY
    // =========================================================================
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      }
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

    const termoUrl = encodeURIComponent(termoBuscaFinal);
    const listaFinal: { htmlRaw: string }[] = [];
    let numeroPagina = 1;

    while (true) {
      const urlBusca = `https://www.ligaonepiece.com.br/?view=cards/search&card=${termoUrl}&page=${numeroPagina}`;
      await page.goto(urlBusca, { waitUntil: 'domcontentloaded' });

      // =========================================================================
      // LOG DETETIVE: Vai aparecer nos logs do Railway pra gente saber onde ele parou
      // =========================================================================
      const tituloPagina = await page.title();
      console.log(`[DEBUG] Página ${numeroPagina} carregada. Título: "${tituloPagina}"`);

      try {
        // Aumentamos o limite para 8 segundos para compensar a velocidade da nuvem
        await page.waitForSelector('.price-min', { timeout: 8000 });
      } catch (e) {
        console.log(`[DEBUG] Fim das páginas ou timeout atingido na página ${numeroPagina}.`);
        break; 
      }

      const mtgPrices = page.locator('.mtg-prices');
      const blocosDeCarta = await mtgPrices.evaluateAll(elements => 
        elements.map(el => el.parentElement?.innerHTML || "")
      );

      if (blocosDeCarta.length === 0) break;

      for (const htmlBloco of blocosDeCarta) {
        if (!htmlBloco) continue;
        const textoLower = htmlBloco.toLowerCase();

        if (!textoLower.includes(nomeLimpoParaBusca.toLowerCase())) {
          continue; 
        }

        if (codigo) {
          const codigoBuscado = codigo.toLowerCase().trim();
          if (!textoLower.includes(codigoBuscado)) {
            continue; 
          }
        }

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

    return NextResponse.json({ cartas: resultadosFormatados });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}