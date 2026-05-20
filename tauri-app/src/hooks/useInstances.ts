import { useState, useEffect, useCallback } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { GameInstance } from "../types";
import {
    loadInstances,
    insertInstance,
    updateInstance as dbUpdateInstance,
    deleteInstance,
} from "../services/db";
import { MOCK_INSTANCES } from "../constants";

export function useInstances() {
    const [instances, setInstances] = useState<GameInstance[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isTauri()) {
            setInstances(MOCK_INSTANCES);
            setLoading(false);
            return;
        }

        loadInstances()
            .then((rows) => {
                setInstances(rows);
                setLoading(false);
            })
            .catch(() => {
                setInstances([]);
                setLoading(false);
            });
    }, []);

    const createInstance = useCallback(
        async (instance: GameInstance) => {
            if (isTauri()) {
                await insertInstance(instance, instances.length).catch(
                    console.error,
                );
                await invoke("create_instance_dirs", {
                    instanceId: instance.id,
                }).catch(console.error);
            }
            setInstances((prev) => [...prev, instance]);
        },
        [instances.length],
    );

    const updateInstance = useCallback(
        async (updated: GameInstance) => {
            if (isTauri()) {
                const index = instances.findIndex(
                    (inst) => inst.id === updated.id,
                );
                await dbUpdateInstance(
                    updated,
                    index >= 0 ? index : instances.length,
                ).catch(console.error);
            }
            setInstances((prev) =>
                prev.map((inst) => (inst.id === updated.id ? updated : inst)),
            );
        },
        [instances],
    );

    const removeInstance = useCallback(async (id: string) => {
        if (isTauri()) {
            await deleteInstance(id).catch(console.error);
        }
        setInstances((prev) => prev.filter((inst) => inst.id !== id));
    }, []);

    // Re-read a single instance from the DB and update in-memory state
    const reloadInstance = useCallback(async (id: string) => {
        if (!isTauri()) return;
        const all = await loadInstances().catch(() => [] as GameInstance[]);
        const fresh = all.find((i) => i.id === id);
        if (fresh)
            setInstances((prev) => prev.map((i) => (i.id === id ? fresh : i)));
    }, []);

    return {
        instances,
        loading,
        createInstance,
        updateInstance,
        removeInstance,
        reloadInstance,
    };
}
