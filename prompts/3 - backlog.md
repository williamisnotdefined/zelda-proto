Transformei sua review em um backlog técnico por sprint e validei os principais pontos no repo: hoje há lint e build em package.json:10, não encontrei test, não há workflow em .github/workflows, e os hotspots que você marcou batem com o código em client/src/game/scenes/WorldScene.ts:125, server/src/game/World.ts:107 e server/src/network/WebSocketHandler.ts:67.
Premissas
- Assumi sprints de 2 semanas, 1 squad pequena full-stack.
- A ordem prioriza reduzir risco estrutural sem quebrar o slice jogável.
- Guardrail fixo: shared = contrato/limites/enums; game-core = regra pura; server = autoridade/adapters; client = render/UI/adapters.
Sprint 1 — Contrato E Safety Net
- Centralizar regras de nickname/chat/input em shared/src/types.ts e shared/src/constants.ts, removendo duplicação de client/src/ui/NicknameModal.tsx:17, client/src/ui/Chat.tsx:58 e server/src/network/MessageValidation.ts:8.
- Criar builders/helpers de mensagens para JOIN/CHAT/INPUT em game-core/src/input.ts ou shared, para parar de montar payload “na mão” em client/src/network/socket.ts:25 e server/src/network/WebSocketHandler.ts:203.
- Formalizar semântica de snapshot full/delta, tick e troca de instância em shared/src/types.ts:226.
- Subir baseline de qualidade: script de teste por workspace e CI mínima com lint, build e testes.
- Aceite: existe uma única fonte para limites e envelopes; CI roda no monorepo; primeiros testes de validação de mensagem passam.
- Fora do sprint: refatorar WorldScene, World, ECS, performance visual.
Sprint 2 — Adotar De Verdade O game-core
- Mover constantes de movimento/ataque do player para fonte compartilhada, eliminando drift entre client/src/game/controllers/PredictionController.ts:9 e server/src/entities/Player.ts:12.
- Adotar game-core/src/interpolation.ts:6 em entidades visuais e remover a fórmula repetida hoje em client/src/entities/Player.ts:211, client/src/entities/Blob.ts:110, client/src/entities/PortalEntity.ts:78 e similares.
- Escolher game-core/src/snapshot.ts:138 como caminho oficial de normalização no client, integrando com client/src/network/NetworkManager.ts:397.
- Cobrir com testes unitários movement, prediction, interpolation e snapshot apply.
- Aceite: não existe mais 1 - Math.pow(1 - ... / 16.667) espalhado; client processa full/delta por um fluxo único; prediction continua visualmente equivalente.
- Fora do sprint: ACK/baseline, registries, quebra de classes-god.
Sprint 3 — Rede, Resync E Protocolo
- Ativar fallback operacional de full snapshot em server/src/network/WebSocketHandler.ts:34 ou implementar baseline ACK de vez entre shared, game-core e server/src/network/SnapshotSerializer.ts:291.
- Endurecer recuperação de base perdida, delta fora de ordem e troca de instância entre server/src/network/SnapshotSerializer.ts:291, client/src/network/NetworkManager.ts:405 e game-core/src/snapshot.ts:148.
- Revisar handshake/políticas de origem/IP e backpressure em server/src/network/HttpServer.ts:188 e server/src/network/WebSocketHandler.ts:115.
- Adicionar testes de regressão para reconnect, stale tick, out-of-order delta e instance transfer.
- Aceite: reconnect e phase transfer recuperam o mundo sem tela vazia; delta stale é descartado com segurança; full snapshot periódico ou sob demanda funciona.
- Fora do sprint: refatoração visual/client, boss registries.
Sprint 4 — Desinchar O Client Runtime
- Quebrar client/src/game/scenes/WorldScene.ts:125 em orquestradores menores: ingestão de snapshot, presença/pooling de entidades, LOD/minimap, sincronismo com store/HUD.
- Introduzir registries declarativos para inimigos, bosses, hazards e portais a partir dos kinds de shared/src/types.ts:18.
- Extrair partes de client/src/entities/Player.ts:33 para helpers menores de overlay/status/attack telegraph.
- Reduzir acoplamento direto com useGameStore.getState() e singleton de socket em client/src/network/socket.ts:11.
- Aceite: WorldScene deixa de concentrar input + rede + entity factory + HUD + minimapa; adicionar um novo tipo visual não exige editar vários if/else.
- Fora do sprint: refatorar server/src/game/World.ts.
Sprint 5 — Desinchar O Server Runtime
- Quebrar server/src/game/World.ts:107 em pipeline explícito: lifecycle de player, atualização de IA/boss, combate, hazards/drops/portals, rebuild de índices.
- Transformar server/src/game/InstanceManager.ts:101 em configuração declarativa de fases, spawns, portals e seeds.
- Substituir branching por coleção (blobs/slimes/hands/pacmanGhosts) em server/src/game/World.ts:471, server/src/game/systems/SnapshotSystem.ts:32 e server/src/game/systems/SpatialIndexSystem.ts:55 por registries/iteradores.
- Consolidar metadata serializável de hazards/portals/bosses em shared.
- Aceite: novo inimigo/fase/boss entra principalmente por config + comportamento; ordem do update fica testável e explícita.
- Fora do sprint: adoção de ECS, rewrite ampla de combate.
Sprint 6 — Fechamento De Risco E Operação
- Expandir testes e CI para delta snapshot, prediction, combate, transferências e registries.
- Corrigir observabilidade: client/src/monitoring/errorLogger.ts:422 hoje resolve antes do commit real da transação; separar evento informacional de erro na trilha de PWA.
- Revisar caminhos visuais caros com DOMElement/GIF em client/src/entities/Player.ts:101, client/src/entities/PortalEntity.ts:25 e hazards.
- Adicionar shutdown gracioso em server/src/index.ts:13 e limpeza/TTL onde ainda faltar.
- Aceite: merge gate com lint/build/test; logger só confirma persistência após commit; hot paths visuais não dependem de DOM por padrão.
- Fora do sprint: trocar stack/framework, uWebSockets, infra maior.
Prioridade Real
- P1: Sprints 1, 2 e 3.
- P2: Sprints 4 e 5.
- P3: Sprint 6.
Observações De Sequenciamento
- Eu deixaria server/src/core/ecs/EcsWorld.ts fora do plano agora; é distração antes de consolidar registries e fronteiras.
- Também não puxaria framework novo antes de estabilizar contrato, snapshot e prediction.
- O eixo de maior ROI continua sendo unificar o fluxo dividido hoje entre client/src/network/NetworkManager.ts:397, client/src/game/scenes/WorldScene.ts:312, server/src/network/SnapshotSerializer.ts:291 e game-core/src/snapshot.ts:138.
Se quiser, o próximo passo natural é:
1. eu converter isso em tickets estilo Jira com estimativa e dependências;
2. eu detalhar só a Sprint 1 em tarefas de implementação arquivo por arquivo;
3. eu montar uma matriz risco x esforço para validar a ordem antes de codar.