import Display from "@/lib/core/Display";
import Effect from "@/lib/core/Effect";
import EntityList from "@/lib/core/EntityList";

const blendOptions = [
	"None",
	"Normal",
	null,
	"Darken",
	"Multiply",
	"Color Burn",
	"Linear Burn",
	null,
	"Lighten",
	"Screen",
	"Color Dodge",
	"Linear Dodge",
	null,
	"Overlay",
	"Soft Light",
	"Hard Light",
	"Vivid Light",
	"Linear Light",
	"Pin Light",
	"Hard Mix",
	null,
	"Difference",
	"Exclusion",
	"Subtract",
	"Divide",
	null,
	"Negation",
	"Phoenix",
	"Glow",
	"Reflect",
];

const lightingPresetOptions = ["Studio", "Stage", "Grid", "Flat"];

interface SceneElement {
	id: string;
	scene: unknown;
	setSize?: (width: number, height: number) => void;
	addToScene?: (scene: {
		getSize: () => { width: number; height: number };
	}) => void;
	removeFromScene?: (scene: Scene) => void;
	toJSON: () => Record<string, unknown>;
}

export default class Scene extends Display {
	[key: string]: unknown;

	static config = {
		name: "Scene",
		description: "Scene display.",
		type: "display",
		label: "Scene",

		defaultProperties: {
			blendMode: "Normal",
			opacity: 1.0,
			mask: false,
			inverse: false,
			stencil: false,
			cameraDistance: 0,
			cameraAzimuth: (45 * Math.PI) / 180,
			cameraPolar: (30 * Math.PI) / 180,
			lightingPreset: "Studio",
			ambientLightIntensity: 0.08,
			skyLightIntensity: 0.12,
			keyLightIntensity: 2.2,
			fillLightIntensity: 0.75,
			rimLightIntensity: 0.35,
			lightDistance: 700,
			lightColor: "#FFFFFF",
			skyColor: "#F3F1FF",
			groundColor: "#020202",
			shadows: true,
		},
		controls: {
			blendMode: {
				label: "Blending",
				type: "select",
				items: blendOptions,
			},
			opacity: {
				label: "Opacity",
				type: "number",
				min: 0,
				max: 1.0,
				step: 0.01,
				withRange: true,
				withReactor: true,
			},
			mask: {
				label: "Mask",
				type: "toggle",
			},
			inverse: {
				label: "Inverse",
				type: "toggle",
				hidden: (display: { properties: Record<string, unknown> }) =>
					!display.properties.mask,
			},
			lightingPreset: {
				label: "Lighting",
				type: "select",
				items: lightingPresetOptions,
			},
			ambientLightIntensity: {
				label: "Ambient",
				type: "number",
				min: 0,
				max: 1,
				step: 0.01,
				withRange: true,
			},
			skyLightIntensity: {
				label: "Sky",
				type: "number",
				min: 0,
				max: 1.5,
				step: 0.01,
				withRange: true,
			},
			keyLightIntensity: {
				label: "Key",
				type: "number",
				min: 0,
				max: 4,
				step: 0.01,
				withRange: true,
			},
			fillLightIntensity: {
				label: "Fill",
				type: "number",
				min: 0,
				max: 4,
				step: 0.01,
				withRange: true,
			},
			rimLightIntensity: {
				label: "Rim",
				type: "number",
				min: 0,
				max: 4,
				step: 0.01,
				withRange: true,
			},
			lightDistance: {
				label: "Distance",
				type: "number",
				min: 50,
				max: 2500,
				step: 1,
				withRange: true,
			},
			lightColor: {
				label: "Light Color",
				type: "color",
			},
			skyColor: {
				label: "Sky Color",
				type: "color",
			},
			groundColor: {
				label: "Ground Color",
				type: "color",
			},
			shadows: {
				label: "Shadows",
				type: "toggle",
			},
		},
	};

	declare displays: EntityList;
	declare effects: EntityList;
	declare stage: unknown;

	constructor(properties?: Record<string, unknown>) {
		super(Scene, properties);

		this.stage = null;
		this.displays = new EntityList();
		this.effects = new EntityList();

		this.getSize = this.getSize.bind(this);
	}

	getSize(): { width: number; height: number } {
		const stage = this.stage as {
			getSize?: () => { width: number; height: number };
		} | null;
		if (stage?.getSize) {
			return stage.getSize();
		}

		return { width: 1, height: 1 };
	}

	setSize(width: number, height: number) {
		for (const display of this.displays as SceneElement[]) {
			if (display.setSize) {
				display.setSize(width, height);
			}
		}

		for (const effect of this.effects as SceneElement[]) {
			if (effect.setSize) {
				effect.setSize(width, height);
			}
		}
	}

	getTarget(obj: unknown): EntityList {
		return obj instanceof Effect ? this.effects : this.displays;
	}

	getElementById(id: string) {
		return this.displays.getElementById(id) || this.effects.getElementById(id);
	}

	hasElement(obj: SceneElement) {
		return !!this.getElementById(obj.id);
	}

	addElement(obj: SceneElement, index?: number) {
		if (!obj) {
			return;
		}

		const { getSize } = this;
		const scene = { getSize } as {
			getSize: () => { width: number; height: number };
		};

		const target = this.getTarget(obj);

		target.addElement(obj, index);

		obj.scene = this;

		if (obj.addToScene) {
			obj.addToScene(scene);
		}

		if (obj.setSize) {
			const stage = this.stage as {
				getSize: () => { width: number; height: number };
			};
			const { width, height } = stage.getSize();

			obj.setSize(width, height);
		}

		return obj;
	}

	removeElement(obj: SceneElement) {
		if (!this.hasElement(obj)) {
			return false;
		}

		const target = this.getTarget(obj);

		target.removeElement(obj);

		obj.scene = null;

		if (obj.removeFromScene) {
			obj.removeFromScene(this);
		}

		return true;
	}

	shiftElement(obj: unknown, spaces: number) {
		const element = obj as SceneElement;
		if (!this.hasElement(element)) {
			return false;
		}

		const target = this.getTarget(obj);

		return target.shiftElement(obj, spaces);
	}

	toJSON() {
		const json = super.toJSON();
		const { displays, effects } = this;

		return {
			...json,
			displays: displays.map((display: SceneElement) => display.toJSON()),
			effects: effects.map((effect: SceneElement) => effect.toJSON()),
		};
	}
}
