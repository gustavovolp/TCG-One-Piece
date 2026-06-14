# 1. Usamos a imagem oficial do Playwright, que já vem com o Node.js e o Chromium instalados de fábrica
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# 2. Criamos a pasta onde o seu projeto vai morar dentro do servidor
WORKDIR /app

# 3. Copiamos o package.json e instalamos as bibliotecas (React, Next, etc)
COPY package*.json ./
RUN npm install

# 4. Copiamos todo o resto do seu código para o servidor
COPY . .

# 5. Geramos a versão de produção do Next.js
RUN npm run build

# 6. Abrimos a porta padrão
EXPOSE 3000

# 7. Comando final para manter o servidor Next.js rodando!
CMD ["npm", "start"]