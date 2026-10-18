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
# Protomaps daily builds: https://build-metadata.protomaps.dev/builds.json
PROTOMAPS_BUILD ?= $(shell curl -s https://build-metadata.protomaps.dev/builds.json | python3 -c 'import json,sys;print(json.load(sys.stdin)[-2]["key"])')

.PHONY: basemap assets site clean

basemap: $(BUILD)/galicia.pmtiles

$(BUILD)/galicia.pmtiles:
	mkdir -p $(BUILD)
	pmtiles extract https://build.protomaps.com/$(PROTOMAPS_BUILD) $@ --bbox=$(BBOX) --maxzoom=$(MAXZOOM)
	echo "$(PROTOMAPS_BUILD)" > $(BUILD)/basemap-version.txt

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
