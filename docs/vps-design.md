# Deseño do servidor para capas en vivo (avións e buques)

- Estado: **proposta, pendente de aprobación**. Non se contrata nada sen o teu visto e prace.
- Data: 18/10/2026

## Por que fai falta

GitHub Actions só executa tarefas programadas como moito cada 5 minutos, e non garante a hora: na práctica hai atrasos de varios minutos. Dúas capas non encaixan aí:

| Capa | Necesidade | Por que non vale Actions |
|---|---|---|
| Avións (adsb.lol) | Instantánea cada 60–120 s | Cadencia mínima de 5 min, sen garantía |
| Buques (AISStream) | Conexión websocket permanente | Actions non mantén procesos vivos |

O resto de capas segue en GitHub Actions.

## Arquitectura proposta

```
adsb.lol (HTTP, cada 60 s) ──┐
                             ├─► VPS: dous servizos systemd ─► ficheiros JSON ─► FTPS ─► Dinahosting (mesmo orixe)
AISStream (websocket) ───────┘        ga-avions, ga-buques                         cada 60 s
```

- **`ga-avions`**: cada 60 s pide a adsb.lol os avións nun radio de 150 NM arredor de Galicia. Escribe `avions/data.json` e `meta.json` co mesmo contrato e a mesma política de fallo ca o resto de capas (`pipeline/lib`). O navegador interpola entre instantáneas; con `prefers-reduced-motion` non se anima.
- **`ga-buques`**: mantén a conexión con AISStream, garda en memoria a última posición e os datos estáticos de cada buque e aplica a regra de atraso (`pipeline/lib/ais-privacy.ts`). Cada 60 s escribe a instantánea. **Queda desactivado** ata ter permiso escrito de AISStream.
- **Publicación**: un temporizador systemd sube os ficheiros por FTPS a Dinahosting. Así o navegador segue pedindo todo ao mesmo orixe e o VPS non se expón á web.
- **Código**: o mesmo repositorio (`services/live/`), en TypeScript con Node 24. Despregue con `git pull` e `systemctl restart`, documentado.
- **Chaves**: nun ficheiro de entorno do VPS lexible só polo usuario do servizo. Nunca no repo.
- **Seguridade**: sen portos abertos agás SSH con chave, actualizacións automáticas de seguridade e devasa (`ufw`).
- **Vixilancia**: se un servizo cae, systemd reiníciao. A páxina `/estado` amosa a capa como `stale` se deixa de actualizarse, como as demais.

## Privacidade nos avións

adsb.lol inclúe matrícula (`r`) e indicativo de voo. Propoño:
- voos comerciais (con indicativo de compañía): indicativo, tipo de avión, altitude e velocidade;
- aviación xeral e privada (sen indicativo de compañía): ocultar a matrícula e o indicativo, e amosar só tipo, altitude e velocidade.

## Opcións de aloxamento

Os prezos son orientativos e **hai que confirmalos antes de contratar**.

| Opción | Recursos | Custo estimado | A favor | En contra |
|---|---|---|---|---|
| **A. VPS pequeno en provedor europeo** (p. ex., Hetzner CX22 ou similar) | 2 vCPU, 4 GB RAM, 40 GB | ~5 €/mes | Barato, centros de datos na UE | Novo provedor para a FGS |
| B. VPS en Dinahosting | similar | non verificado, probablemente 10–20 €/mes | Mesmo provedor e factura ca a revista | Prezo e características por confirmar |
| C. Raspberry Pi na Leira Experimental | 4 GB | ~80 € unha vez e electricidade | Sen cota mensual; podería alimentar tamén un receptor ADS-B propio | Depende da conexión e da electricidade da Leira; mantemento físico |

**Recomendación: A**, cun custo anual arredor de 60 €. Os servizos consumen moi pouco (unha petición por minuto e un websocket).

A opción C ten un valor engadido: un receptor ADS-B propio cumpriría a condición que adsb.lol anunciou para dar a chave futura, e a FGS achegaría datos á rede comunitaria. Non substitúe o VPS, pero pódese engadir despois.

## Alternativa se Dinahosting non serve PMTiles

Se na proba de despregue Dinahosting non admite peticións HTTP Range, o mapa base PMTiles non funcionará alí. Nese caso, o mesmo VPS podería servir todo o sitio con Caddy (HTTPS automático, Range nativo). Iso cambiaría o ADR 0003 e preguntaríache antes.

## Que necesito para seguir

1. Aprobación da opción e do custo.
2. Que a FGS cree a conta no provedor. Eu non podo crear contas nin pagar.
3. Credenciais FTPS de Dinahosting como segredos do repositorio (`FTPS_HOST`, `FTPS_USER`, `FTPS_PASSWORD`, `FTPS_DIR`), tamén para o despregue do sitio.
4. O subdominio ou dominio onde vai vivir Galicia Agora.
