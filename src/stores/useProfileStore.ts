import { create } from "zustand";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import type { Profile, ToolTarget } from "@/types";

interface ProfileState {
  profiles: Profile[];
  activeProfileId: string | null;
  isLoading: boolean;
  fetchProfiles: () => Promise<void>;
  addProfile: (profile: Profile) => void;
  updateProfile: (profile: Profile) => void;
  removeProfile: (id: string) => void;
  setActiveProfileId: (id: string | null) => void;
  computeMixedState: (tool: ToolTarget) => boolean;
}

export const useProfileStore = create<ProfileState>((_set, get) => ({
  profiles: [],
  activeProfileId: null,
  isLoading: false,

  fetchProfiles: async () => {
    _set((state) => ({ ...state, isLoading: true }));
    try {
      const profiles = await invokeCommand<Profile[]>("profile_list");
      _set((state) => ({ ...state, profiles, isLoading: false }));
    } catch {
      _set((state) => ({ ...state, isLoading: false }));
    }
  },

  addProfile: (profile: Profile) => {
    _set((state) => ({ ...state, profiles: [...state.profiles, profile] }));
  },

  updateProfile: (profile: Profile) => {
    _set((state) => ({
      ...state,
      profiles: state.profiles.map((p) => (p.id === profile.id ? profile : p)),
    }));
  },

  removeProfile: (id: string) => {
    _set((state) => ({
      ...state,
      profiles: state.profiles.filter((p) => p.id !== id),
    }));
  },

  setActiveProfileId: (id: string | null) => {
    _set((state) => ({ ...state, activeProfileId: id }));
  },

  computeMixedState: (tool: ToolTarget): boolean => {
    const { activeProfileId, profiles } = get();
    if (!activeProfileId) return false;

    const activeProfile = profiles.find((p) => p.id === activeProfileId);
    if (!activeProfile) return false;

    const storeState = useConfigStore.getState();
    const config =
      tool === "code" ? storeState.codeConfig : storeState.desktopConfig;

    if (!config) return false;

    const profileSnapshot = activeProfile.mcpServers[tool];
    const sortedProfile = JSON.stringify(Object.entries(profileSnapshot).sort());
    const sortedCurrent = JSON.stringify(Object.entries(config.mcpServers).sort());
    return sortedProfile !== sortedCurrent;
  },
}));
