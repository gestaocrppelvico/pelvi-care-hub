import L from "leaflet";

// Corrige o problema de ícones default do Leaflet com bundlers
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// @ts-expect-error - sobrescreve método interno
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

// Pin customizado para médicos (cor primary do design system)
export const medicoIcon = L.divIcon({
  className: "medico-marker",
  html: `<div style="
    width: 32px; height: 32px;
    background: hsl(var(--primary));
    border: 3px solid white;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
  ">
    <div style="
      width: 10px; height: 10px;
      background: white;
      border-radius: 50%;
      transform: rotate(45deg);
    "></div>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -30],
});

// Pin para a localização do usuário
export const userIcon = L.divIcon({
  className: "user-marker",
  html: `<div style="
    width: 22px; height: 22px;
    background: hsl(var(--accent, 142 71% 45%));
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 4px hsla(142, 71%, 45%, 0.25), 0 2px 6px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
