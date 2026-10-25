# Fixtures: vut-concello

`aloxamentos-vut.csv`: recorte do mesmo CSV do REAT ca aloxamento-reat
(`https://descargascdn.xunta.gal/interno/smarxa/reat_directorio-alojamientos_esp.csv`,
descarga do 24/10/2026, «Fecha de referencia: 2026-10-01»): preámbulo, cabeceira e todas as
filas (de calquera tipo) de Oza Cesuras, Cerdedo Cotobade, A Arnoia, Sarreaus (ningunha VUT),
Navia de Suarna e Taboadela (unha VUT sen prazas), máis a única fila con «;» dentro dun campo
(unha VUT de Ferrol). Total: 112 filas, 73 VUT.

Cambios por privacidade: baleiráronse `telefono` e `correo_promocional` en todas as filas e,
nas VUT, `direccion`; o nome das VUT substituíuse pola súa signatura (agás a fila con «;»,
que se deixa enteira para probar o analizador e non ten nome de persoa).

`t1558.csv`: resposta real enteira da API de táboas do IGE,
`https://www.ige.gal/igebdt/igeapi/csv/datos/1558/T%5B1:a%5D` (poboación a 1 de xaneiro,
último ano: 2025), gravada o 25/10/2026, en ISO-8859-1 tal como chega. Sen cambios.

Licenzas: REAT CC BY-SA 4.0 (conxunto 0022 de abertos.xunta.gal); IGE, aviso legal
(https://www.ige.gal/web/avisolegal.jsp), «Fonte: IGE». Este produto emprega a API de datos
do Instituto Galego de Estatística (IGE), pero non está certificado ou aprobado polo IGE.
