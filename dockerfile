# Use a imagem base do Node.js
FROM node:16-alpine

# Defina o diretório de trabalho
WORKDIR /app

# Copie os arquivos package.json e package-lock.json
COPY package*.json ./

# Instale as dependências
RUN npm install

# Copie o restante do código da aplicação
COPY . .

# Exponha a porta 3000
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "server.js"]