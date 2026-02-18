"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { MapContainer, TileLayer, FeatureGroup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

// Fix default icon in Next.js/webpack
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const CARTO_DARK =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export type BBox = [number, number, number, number]; // minLon, minLat, maxLon, maxLat

export interface MapSelectorProps {
  onConfirm: (bbox: BBox) => void;
  onCancel: () => void;
}

function DrawControl({
  featureGroupRef,
  onHasLayerChange,
}: {
  featureGroupRef: React.RefObject<L.FeatureGroup | null>;
  onHasLayerChange: (hasLayer: boolean) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const fg = featureGroupRef.current;
    if (!map || !fg) return;

    const DrawControlClass = (L.Control as unknown as { Draw?: new (options: L.Control.DrawConstructorOptions) => L.Control }).Draw;
    if (!DrawControlClass) return;
    const drawControl = new DrawControlClass({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: {
            color: "#3b82f6",
            weight: 2,
            fillColor: "#3b82f6",
            fillOpacity: 0.3,
          },
        },
        polyline: false,
        circle: false,
        rectangle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: fg,
        remove: true,
      },
    });

    map.addControl(drawControl);

    const layerGroup = fg;
    function updateHasLayer() {
      onHasLayerChange(layerGroup.getLayers().length > 0);
    }

    layerGroup.on("layeradd", updateHasLayer);
    layerGroup.on("layerremove", updateHasLayer);
    updateHasLayer();

    return () => {
      map.removeControl(drawControl);
      layerGroup.off("layeradd", updateHasLayer);
      layerGroup.off("layerremove", updateHasLayer);
    };
  }, [map, featureGroupRef, onHasLayerChange]);

  return null;
}

function MapSelectorInner({ onConfirm, onCancel }: MapSelectorProps) {
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const [hasDrawnLayer, setHasDrawnLayer] = useState(false);

  const handleConfirm = useCallback(() => {
    const fg = featureGroupRef.current;
    if (!fg) return;
    const layers = fg.getLayers();
    if (layers.length === 0) return;
    const bounds = fg.getBounds();
    const bbox: BBox = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    onConfirm(bbox);
  }, [onConfirm]);

  return (
    <>
      <MapContainer
        center={[52.52, 13.405]}
        zoom={10}
        className="h-full w-full"
        style={{ background: "#1a1a2e" }}
      >
        <TileLayer url={CARTO_DARK} attribution={CARTO_ATTR} />
        <FeatureGroup ref={featureGroupRef}>
          <DrawControl
            featureGroupRef={featureGroupRef}
            onHasLayerChange={setHasDrawnLayer}
          />
        </FeatureGroup>
      </MapContainer>

      <div className="absolute right-4 top-4 z-[1000] flex flex-col gap-2 rounded-xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
        <p className="text-xs font-medium text-muted-foreground">
          Use the toolbar on the map to draw a polygon or edit it, then confirm selection below.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasDrawnLayer}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            Confirm Selection
          </button>
        </div>
      </div>
    </>
  );
}

export function MapSelector(props: MapSelectorProps) {
  return (
    <div className="absolute inset-0 z-[500] flex flex-col bg-background">
      <div className="relative h-full w-full">
        <MapSelectorInner {...props} />
      </div>
    </div>
  );
}
