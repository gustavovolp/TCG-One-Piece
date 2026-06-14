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

    // 1. Limpeza do Nome (Remove o que estiver entre parênteses digitado pelo usuário)
    const nomeLimpoParaBusca = nome
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // =========================================================================
    // 2. MONTAGEM DA URL (APENAS O NOME)
    // A pedido, enviamos SOMENTE o nome para o site da Liga para evitar 
    // qualquer conflito com o motor de busca deles.
    // =========================================================================
    const termoBuscaFinal = nomeLimpoParaBusca;
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Hack de velocidade: bloqueia imagens, mídias e css pesados
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

      try {
        await page.waitForSelector('.price-min', { timeout: 2500 });
      } catch (e) {
        break; // Não achou mais preços, as páginas acabaram
      }

      const mtgPrices = page.locator('.mtg-prices');
      const blocosDeCarta = await mtgPrices.evaluateAll(elements => 
        elements.map(el => el.parentElement?.innerHTML || "")
      );

      if (blocosDeCarta.length === 0) break;

      for (const htmlBloco of blocosDeCarta) {
        if (!htmlBloco) continue;
        const textoLower = htmlBloco.toLowerCase();

        // =========================================================
        // FILTRAGEM INTERNA (O NOSSO "LEÃO DE CHÁCARA")
        // =========================================================
        
        // 1ª VERIFICAÇÃO: O nome base está em algum lugar do texto?
        if (!textoLower.includes(nomeLimpoParaBusca.toLowerCase())) {
          continue; 
        }

        // 2ª VERIFICAÇÃO: Se o usuário digitou o código, checamos puramente no nosso back-end
        // "OP14-084" passa em "OP14-084-SP" naturalmente
        if (codigo) {
          const codigoBuscado = codigo.toLowerCase().trim();
          if (!textoLower.includes(codigoBuscado)) {
            continue; 
          }
        }

        // Passou nos testes, adiciona na lista!
        listaFinal.push({ htmlRaw: htmlBloco });
      }

      numeroPagina++;
      
      // Como estamos buscando APENAS pelo nome, personagens como o Luffy 
      // podem ter dezenas de páginas. Subi a trava para 15 por precaução.
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