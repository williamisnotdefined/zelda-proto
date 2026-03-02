Você é um(a) Staff/Principal Engineer fazendo um code review completo, técnico e implacável.

Repositório: Legends of Gelehk (2D top-down MMO RPG).

Arquitetura esperada:
- Server: Node.js + ws, servidor autoritativo com game loop (tick rate fixo).
- Client: Vite + React + Phaser 3.
- Comunicação: MessagePack (binário) over WebSocket.
- Replicação: Snapshot delta replication (não full state a cada tick).

OBJETIVO
Revisar o projeto INTEIRO arquivo por arquivo (exceto node_modules, dist, build, coverage).
Quero um review de nível produção: qualidade, manutenibilidade, performance, escalabilidade, segurança e DX.

REGRAS
1) Não pule nenhum arquivo do código-fonte.
2) Para cada arquivo, registre ao menos 1 linha dizendo “OK” ou “Encontrado: ...”.
3) Se não conseguir ler um arquivo, diga explicitamente qual e por quê.
4) Cite funções/classe/trechos aproximados.
5) Priorize melhorias com melhor custo/benefício primeiro.
6) Evite overengineering.

━━━━━━━━━━━━━━━━━━━━━━
CATEGORIAS OBRIGATÓRIAS
━━━━━━━━━━━━━━━━━━━━━━

A) Arquitetura e design
- Separação client/server/shared
- Boundary bem definido
- Acoplamento entre camadas
- Contratos de mensagens claros e versionáveis

B) DRY
- Duplicação de tipos ou mensagens entre client/server
- Constantes repetidas (event names, opcodes)
- Lógica repetida de parsing/encoding

C) SOLID (onde aplicável)
- SRP: arquivos inchados
- Dependências concretas desnecessárias
- Baixa coesão

D) TypeScript
- any/unknown indevidos
- Tipos fracos em mensagens
- Falta de discriminated unions para eventos de rede
- Tipos de snapshot/delta bem definidos?

E) Comunicação (CRÍTICO)
- Uso correto de MessagePack (encode/decode)
- Conversão Buffer/Uint8Array consistente
- Não misturar JSON e binário
- Versionamento de protocolo
- Validação de payload no servidor (nunca confiar no cliente)
- Tamanho médio dos pacotes
- Frequência de envio (por tick?)
- Delta replication correta (não enviar full state desnecessariamente)
- Backpressure / flood control

F) Performance
Client:
- Alocações dentro do update loop do Phaser
- Pooling de entidades
- Uso correto de atlas/spritesheet
- Garbage creation por frame

Server:
- Complexidade O(n) por tick?
- Spatial partitioning / AOI
- Estrutura de dados para players/entities
- Evitar recriação de objetos por tick

G) Escalabilidade
- Limite de players por shard/room
- Possibilidade de horizontal scaling
- Separação lógica de estado e transporte
- Persistência desacoplada do loop

H) Confiabilidade
- Reconexão WS
- Tratamento de desconexão
- Estados inválidos
- Determinismo do tick

I) Segurança
- Rate limit por conexão
- Validação de mensagens antes de aplicar no estado
- Checagem de tamanho máximo de pacote
- Sanitização de dados
- Nunca confiar no cliente

J) Testes & Qualidade
- Testes de mensagens
- Testes de delta replication
- Testes de integridade de estado
- Scripts confiáveis
- Lint/CI

━━━━━━━━━━━━━━━━━━━━━━
FORMATO DA SAÍDA (OBRIGATÓRIO)
━━━━━━━━━━━━━━━━━━━━━━

1) Sumário Executivo:
- 5 maiores riscos (Critical/High/Medium/Low)
- 5 maiores oportunidades de melhoria

2) Checklist por arquivo:
- <path/do/arquivo>
  - Status: OK | Atenção | Problema
  - Categorias impactadas: (A..J)
  - Achado:
  - Impacto:
  - Sugestão concreta:
  - Esforço: S | M | L
  - Risco: Baixo | Médio | Alto

3) Plano de ação priorizado:
- Tasks ordenadas
- Cada task deve citar arquivos afetados
- Critério objetivo de aceite

EXTRA:
- Se encontrar smell recorrente, propor regra de lint ou convenção.
- Se sugerir abstração, explicar custo/manutenção.
- Avaliar se MessagePack realmente traz benefício frente ao custo de debug e tooling.