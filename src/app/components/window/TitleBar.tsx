import useAppStore, {
	handleMenuAction,
	toggleBottomPanelVisibility,
	toggleLeftPanelVisibility,
	toggleRightPanelVisibility,
} from "@/app/actions/app";
import useProject, { DEFAULT_PROJECT_NAME } from "@/app/actions/project";
import { player } from "@/app/global";
import { env } from "@/app/global";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import menuConfig from "@/lib/config/menu.json";
import {
	Menu as MenuIcon,
	PanelBottom,
	PanelLeft,
	PanelRight,
} from "lucide-react";
import React, { useEffect, useState } from "react";

const NAV_LABELS = ["File", "Edit"];

type MenuAction =
	| "new-project"
	| "open-project"
	| "save-project"
	| "load-audio"
	| "save-image"
	| "save-video"
	| "edit-canvas"
	| "open-dev-tools";

type MenuEntry = {
	key?: string;
	label?: string;
	action?: MenuAction;
	type?: "separator";
	checked?: boolean;
	disabled?: boolean;
	hidden?: boolean;
	role?: string;
	accelerator?: string;
};

interface MenuSection {
	label: string;
	hidden?: boolean;
	submenu?: MenuEntry[];
}

const typedMenuConfig = menuConfig as MenuSection[];

function createMenuItemKey(item: MenuEntry, sectionLabel: string, index: number) {
	if (item.key) {
		return item.key;
	}

	const base =
		item.action ||
		item.label?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
		item.type ||
		"item";

	return `${sectionLabel.toLowerCase()}-${base}-${index}`;
}

function cloneSubmenu(items: MenuEntry[] = [], sectionLabel = "menu"): MenuEntry[] {
	return items.map((item, index) => ({
		...item,
		key: createMenuItemKey(item, sectionLabel, index),
	}));
}

function createMenuItems(): MenuEntry[] {
	const merged = typedMenuConfig
		.filter((item) => NAV_LABELS.includes(item.label) && !item.hidden)
		.flatMap((item, index) => {
			const submenu = cloneSubmenu(item.submenu, item.label);
			if (index === 0) {
				return submenu;
			}

			return [
				{
					type: "separator" as const,
					key: `separator-${item.label.toLowerCase()}`,
				},
				...submenu,
			];
		});

	return merged.filter((item, index, list) => {
		if (item.type !== "separator") {
			return true;
		}

		const prev = list[index - 1];
		const next = list[index + 1];
		return (
			prev && prev.type !== "separator" && next && next.type !== "separator"
		);
	});
}

export default function TitleBar() {
	const isVideoRecording = useAppStore((state) => state.isVideoRecording);
	const isLeftPanelVisible = useAppStore((state) => state.isLeftPanelVisible);
	const isBottomPanelVisible = useAppStore(
		(state) => state.isBottomPanelVisible,
	);
	const isRightPanelVisible = useAppStore((state) => state.isRightPanelVisible);
	const projectName = useProject((state) => state.projectName);
	const [hasAudio, setHasAudio] = useState(() => player.hasAudio());
	const [menuItems, setMenuItems] = useState<MenuEntry[]>(createMenuItems);
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		const syncAudioAvailability = () => {
			setHasAudio(player.hasAudio());
		};

		player.on("audio-load", syncAudioAvailability);
		player.on("audio-unload", syncAudioAvailability);

		return () => {
			player.off("audio-load", syncAudioAvailability);
			player.off("audio-unload", syncAudioAvailability);
		};
	}, []);

	function onMenuItemClick(item: MenuEntry) {
		const { action, checked } = item;
		if (isMenuItemDisabled(item)) {
			return;
		}

		setMenuOpen(false);

		if (checked !== undefined) {
			setMenuItems((current) =>
				current.map((menuItem) =>
					menuItem.action === action && menuItem.checked !== undefined
						? { ...menuItem, checked: !menuItem.checked }
						: menuItem,
				),
			);
		}

		if (action) {
			handleMenuAction(action);
		}
	}

	function isMenuItemDisabled(item: MenuEntry) {
		if (item.disabled) {
			return true;
		}

		if (item.action === "save-video") {
			return !hasAudio || isVideoRecording;
		}

		return false;
	}

	const panelButtons = [
		{
			key: "left",
			label: `${isLeftPanelVisible ? "Hide" : "Show"} layers and reactors panel`,
			isVisible: isLeftPanelVisible,
			icon: PanelLeft,
			onClick: toggleLeftPanelVisibility,
		},
		{
			key: "bottom",
			label: `${isBottomPanelVisible ? "Hide" : "Show"} player and reactor panel`,
			isVisible: isBottomPanelVisible,
			icon: PanelBottom,
			onClick: toggleBottomPanelVisibility,
		},
		{
			key: "right",
			label: `${isRightPanelVisible ? "Hide" : "Show"} controls panel`,
			isVisible: isRightPanelVisible,
			icon: PanelRight,
			onClick: toggleRightPanelVisibility,
		},
	];

	return (
		<div
			className={
				"flex items-center relative h-10 bg-neutral-900 border-b border-b-neutral-700"
			}
		>
			<div className={"flex items-center gap-0.5 ml-1.5 max-w-[45vw]"}>
				<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								className={`bg-transparent text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 ${menuOpen ? "text-neutral-100 bg-primary" : ""}`}
								aria-label="Main menu"
							/>
						}
					>
						<MenuIcon size={16} />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="bg-neutral-900 border-neutral-700 rounded shadow-lg p-1 min-w-56"
						align="start"
						sideOffset={6}
					>
						{menuItems.map((item) => {
							if (item.type === "separator") {
								return <DropdownMenuSeparator key={item.key} />;
							}

							if (item.checked !== undefined) {
								return (
									<DropdownMenuCheckboxItem
										key={item.key}
										checked={item.checked}
										disabled={isMenuItemDisabled(item)}
										className="text-sm min-w-44 rounded focus:text-neutral-100 focus:bg-primary"
										onClick={() => onMenuItemClick(item)}
									>
										{item.label}
									</DropdownMenuCheckboxItem>
								);
							}

							return (
								<DropdownMenuItem
									key={item.key}
									disabled={isMenuItemDisabled(item)}
									className="text-sm min-w-44 rounded focus:text-neutral-100 focus:bg-primary"
									onClick={() => onMenuItemClick(item)}
								>
									{item.label}
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					variant="ghost"
					size="sm"
					className="bg-transparent text-neutral-400 truncate max-w-[32vw] hover:text-neutral-100 hover:bg-neutral-800"
					onClick={() => handleMenuAction("edit-canvas")}
				>
					{projectName || DEFAULT_PROJECT_NAME}
				</Button>
			</div>
			<div className="absolute left-1/2 -translate-x-1/2 text-sm leading-10 tracking-widest uppercase cursor-default max-[700px]:hidden text-neutral-400">
				{env.APP_NAME}
			</div>
			<div className="absolute top-1 right-2 flex items-center gap-1">
				{panelButtons.map((button) => {
					const Icon = button.icon;

					return (
						<Button
							key={button.key}
							variant="ghost"
							size="icon-sm"
							className={`${
								button.isVisible
									? "bg-transparent text-neutral-400"
									: "bg-transparent text-neutral-500"
							} hover:bg-neutral-800 hover:text-neutral-100`}
							aria-label={button.label}
							aria-pressed={button.isVisible}
							onClick={button.onClick}
						>
							<Icon size={16} />
						</Button>
					);
				})}
				<img
					alt=""
					aria-hidden="true"
					className="w-7 h-7 ml-1"
					draggable={false}
					src="/icon.svg"
				/>
			</div>
		</div>
	);
}
