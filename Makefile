# Heavy geodata steps. Requires: pmtiles (go-pmtiles), tippecanoe, git.
# macOS: brew install pmtiles tippecanoe   ·   Ubuntu CI: see .github/workflows/deploy.yml
#
#   make basemap   Galicia extract of the Protomaps OSM build (~140 MB, z0–14)
#   make assets    glyphs (Noto Sans, OFL) and sprites (MIT) from protomaps/basemaps-assets
#   make site      ingest catalogue + prepare + astro build + pagefind

BUILD := build
# Galicia plus a margin of sea and the neighbouring regions.
BBOX := -9.6,41.7,-6.6,44.0
MAXZOOM := 14
# Low-zoom context around Galicia (Iberian Peninsula and the sea) so the map
# never ends in an empty edge when zooming out or panning.
CONTEXT_BBOX := -16,36,-1,48.5
CONTEXT_MAXZOOM := 8
# Protomaps daily builds: https://build-metadata.protomaps.dev/builds.json
# The metadata host sometimes times out; daily builds are named YYYYMMDD.pmtiles,
# so fall back to the one from two days ago (GNU date in CI, BSD date on macOS).
PROTOMAPS_BUILD ?= $(shell k=$$(curl -s -m 20 https://build-metadata.protomaps.dev/builds.json | python3 -c 'import json,sys;print(json.load(sys.stdin)[-2]["key"])' 2>/dev/null); [ -n "$$k" ] && echo "$$k" || echo "$$(date -u -d '2 days ago' +%Y%m%d 2>/dev/null || date -u -v-2d +%Y%m%d).pmtiles")

.PHONY: basemap assets site clean

basemap: $(BUILD)/galicia.pmtiles $(BUILD)/contexto.pmtiles

$(BUILD)/galicia.pmtiles:
	mkdir -p $(BUILD)
	pmtiles extract https://build.protomaps.com/$(PROTOMAPS_BUILD) $@ --bbox=$(BBOX) --maxzoom=$(MAXZOOM)
	echo "$(PROTOMAPS_BUILD)" > $(BUILD)/basemap-version.txt

$(BUILD)/contexto.pmtiles:
	mkdir -p $(BUILD)
	pmtiles extract https://build.protomaps.com/$(PROTOMAPS_BUILD) $@ --bbox=$(CONTEXT_BBOX) --maxzoom=$(CONTEXT_MAXZOOM)

assets: $(BUILD)/assets/fonts

$(BUILD)/assets/fonts:
	rm -rf $(BUILD)/assets
	git clone -q --depth 1 --filter=blob:none --sparse https://github.com/protomaps/basemaps-assets.git $(BUILD)/assets
	cd $(BUILD)/assets && git sparse-checkout set "fonts/Noto Sans Regular" "fonts/Noto Sans Medium" "fonts/Noto Sans Italic" sprites/v4

site: basemap assets
	npm run catalog
	npm run build

clean:
	rm -rf $(BUILD) dist site/public/data site/public/basemap site/public/glyphs site/public/sprites site/public/style-*.json
