import SectionAddMenu from "./SectionAddMenu";

const DISPLAY_2D_CATEGORIES = [
	{
		label: "2D",
		items: [
			"Text",
			"Image",
			"Video",
			"Shape",
			"Bar Spectrum",
			"Radial Spectrum",
			"Wave Spectrum",
			"Sound Wave",
		],
	},
];

interface Add2DDisplaysMenuProps {
	sceneId: string;
}

export default function Add2DDisplaysMenu({ sceneId }: Add2DDisplaysMenuProps) {
	return (
		<SectionAddMenu
			sceneId={sceneId}
			entityType="displays"
			categories={DISPLAY_2D_CATEGORIES}
			ariaLabel="Add 2D display"
		/>
	);
}
