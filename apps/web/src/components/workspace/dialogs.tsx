"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { BREAKER_RATINGS_A } from "@vectrix/core";
import { errorMessage, validationDetails } from "@/lib/client";
import type { PlanPoint } from "@vectrix/core";
import { CIRCUIT_TYPE_LABEL, OCCUPANCY_LABEL } from "./helpers";

const CIRCUIT_COLORS = [
  "#3d7fbf",
  "#b5653c",
  "#4f8a63",
  "#8a6aa8",
  "#b08a2f",
  "#a0576c",
  "#507f86",
  "#7a7f4b",
];

export interface NewCircuitInput {
  name: string;
  description: string;
  type: string;
  phaseMode: "single_phase" | "three_phase";
  breakerRatingA: number;
  breakerCurve: "B" | "C" | "D";
  rcdSensitivityMa: number | null;
  cableSectionMm2: number;
  demandFactor: number;
  color: string;
}

export interface NewRoomInput {
  name: string;
  number: string;
  occupancy: string;
  clearHeightMm: number;
  notes: string;
  polygon: PlanPoint[];
}

function DialogFrame({
  title,
  sub,
  onClose,
  onSubmit,
  formId,
  children,
  footer,
}: {
  title: string;
  sub: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  formId: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const titleId = `dialog-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-head">
          <h2 className="dialog-title" id={titleId}>
            {title}
          </h2>
          <p className="dialog-sub">{sub}</p>
        </div>
        <form className="dialog-body" id={formId} onSubmit={onSubmit}>
          {children}
        </form>
        <div className="dialog-foot">{footer}</div>
      </div>
    </div>
  );
}

function DialogError({ error }: { error: unknown }) {
  if (!error) return null;
  const details = validationDetails(error);
  return (
    <div className="login-error" role="alert" style={{ marginBottom: 12 }}>
      <span>{errorMessage(error)}</span>
      {details.length > 0 && (
        <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11 }}>
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NewCircuitDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: NewCircuitInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("sockets");
  const [description, setDescription] = useState("");
  const [breaker, setBreaker] = useState(16);
  const [curve, setCurve] = useState<"B" | "C" | "D">("B");
  const [rcd, setRcd] = useState<number | null>(30);
  const [section, setSection] = useState(2.5);
  const [demand, setDemand] = useState(0.6);
  const [color, setColor] = useState(CIRCUIT_COLORS[0]!);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        type,
        phaseMode: "single_phase",
        breakerRatingA: breaker,
        breakerCurve: curve,
        rcdSensitivityMa: rcd,
        cableSectionMm2: section,
        demandFactor: demand,
        color,
      });
    } catch (cause) {
      setError(cause);
      setPending(false);
    }
  }

  return (
    <DialogFrame
      title="New circuit"
      sub="A circuit groups equipment, sets protection and carries one cable schedule line. The breaker rating is a design input, not a verified selection."
      onClose={onClose}
      formId="new-circuit-form"
      onSubmit={submit}
      footer={
        <>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" form="new-circuit-form" disabled={pending}>
            {pending ? "Creating…" : "Create circuit"}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </>
      }
    >
      <DialogError error={error} />
      <div className="field-grid">
        <div>
          <label className="field-label" htmlFor="circuit-name">
            Circuit name
          </label>
          <input
            className="field"
            id="circuit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Tomadas cozinha"
            maxLength={40}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="field-label" htmlFor="circuit-type">
            Circuit type
          </label>
          <select
            className="field"
            id="circuit-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {Object.entries(CIRCUIT_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ height: 10 }} />
      <div>
        <label className="field-label" htmlFor="circuit-description">
          Description
        </label>
        <input
          className="field"
          id="circuit-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What the circuit serves and any assumption"
          maxLength={300}
        />
      </div>
      <div style={{ height: 10 }} />
      <div className="field-grid">
        <div>
          <label className="field-label" htmlFor="circuit-breaker">
            Breaker rating
          </label>
          <select
            className="field mono"
            id="circuit-breaker"
            value={breaker}
            onChange={(event) => setBreaker(Number(event.target.value))}
          >
            {BREAKER_RATINGS_A.map((rating) => (
              <option key={rating} value={rating}>
                {rating} A
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="circuit-curve">
            Trip curve
          </label>
          <select
            className="field mono"
            id="circuit-curve"
            value={curve}
            onChange={(event) => setCurve(event.target.value as "B" | "C" | "D")}
          >
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </div>
      </div>
      <div style={{ height: 10 }} />
      <div className="field-grid">
        <div>
          <label className="field-label" htmlFor="circuit-rcd">
            RCD sensitivity
          </label>
          <select
            className="field mono"
            id="circuit-rcd"
            value={rcd ?? ""}
            onChange={(event) => setRcd(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">None recorded</option>
            <option value="30">30 mA</option>
            <option value="100">100 mA</option>
            <option value="300">300 mA</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="circuit-section">
            Cable section (mm²)
          </label>
          <select
            className="field mono"
            id="circuit-section"
            value={section}
            onChange={(event) => setSection(Number(event.target.value))}
          >
            {[1.5, 2.5, 4, 6, 10, 16, 25, 35, 50].map((value) => (
              <option key={value} value={value}>
                {value} mm²
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ height: 10 }} />
      <div>
        <label className="field-label" htmlFor="circuit-demand">
          Demand factor · {demand.toFixed(2)}
        </label>
        <input
          className="field"
          id="circuit-demand"
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={demand}
          onChange={(event) => setDemand(Number(event.target.value))}
          style={{ padding: 0 }}
        />
      </div>
      <div style={{ height: 12 }} />
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">Circuit colour</legend>
        <div className="swatch-row">
          {CIRCUIT_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className="swatch"
              data-active={color === swatch}
              style={{ ["--swatch" as string]: swatch }}
              onClick={() => setColor(swatch)}
              aria-label={`Use colour ${swatch}`}
              aria-pressed={color === swatch}
            />
          ))}
        </div>
      </fieldset>
    </DialogFrame>
  );
}

export function NewRoomDialog({
  polygon,
  onClose,
  onCreate,
}: {
  polygon: PlanPoint[];
  onClose: () => void;
  onCreate: (input: NewRoomInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [occupancy, setOccupancy] = useState("dry");
  const [clearHeight, setClearHeight] = useState(2700);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        number: number.trim(),
        occupancy,
        clearHeightMm: clearHeight,
        notes: notes.trim(),
        polygon,
      });
    } catch (cause) {
      setError(cause);
      setPending(false);
    }
  }

  const area = Math.abs(
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0),
  ) / 2;

  return (
    <DialogFrame
      title="Name this room"
      sub={`${polygon.length} corners · ${(area / 1_000_000).toFixed(1)} m². The polygon is measured from the sheet in millimetres.`}
      onClose={onClose}
      formId="new-room-form"
      onSubmit={submit}
      footer={
        <>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Discard polygon
          </button>
          <button className="btn btn-primary" type="submit" form="new-room-form" disabled={pending}>
            {pending ? "Creating…" : "Create room"}
            <Plus size={14} aria-hidden="true" />
          </button>
        </>
      }
    >
      <DialogError error={error} />
      <div className="field-grid">
        <div>
          <label className="field-label" htmlFor="room-name">
            Room name
          </label>
          <input
            className="field"
            id="room-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sala"
            maxLength={80}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="field-label" htmlFor="room-number">
            Room number
          </label>
          <input
            className="field mono"
            id="room-number"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder="Auto"
            maxLength={20}
          />
        </div>
      </div>
      <div style={{ height: 10 }} />
      <div className="field-grid">
        <div>
          <label className="field-label" htmlFor="room-occupancy">
            Occupancy
          </label>
          <select
            className="field"
            id="room-occupancy"
            value={occupancy}
            onChange={(event) => setOccupancy(event.target.value)}
          >
            {Object.entries(OCCUPANCY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="room-height">
            Clear height (mm)
          </label>
          <input
            className="field mono"
            id="room-height"
            type="number"
            min={100}
            max={20000}
            value={clearHeight}
            onChange={(event) => setClearHeight(Number(event.target.value))}
          />
        </div>
      </div>
      <div style={{ height: 10 }} />
      <div>
        <label className="field-label" htmlFor="room-notes">
          Notes
        </label>
        <textarea
          className="field"
          id="room-notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional"
          maxLength={1000}
        />
      </div>
    </DialogFrame>
  );
}
