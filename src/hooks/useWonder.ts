import { useCallback } from 'react';
import { getWonderDef, rollWonderEvent } from '@/data/colony/wonders';
import type { GameState } from '@/types/game';
import type { WonderState } from '@/types/colony';

interface WonderActions {
  selectWonder: (wonderId: string) => { success: boolean; message: string };
  submitWonderResources: () => { success: boolean; message: string };
  handleWonderEvent: (choice: 'A' | 'B') => { success: boolean; message: string };
  canStartWonder: () => { success: boolean; reasons: string[] };
}

export function useWonder(
  _gameState: GameState,
  dispatch: React.Dispatch<{ type: 'FUNCTIONAL_UPDATE'; updater: (state: GameState) => GameState }>
): WonderActions {

  /** 检查是否满足奇观建设条件 */
  const canStartWonder = useCallback(() => {
    const reasons: string[] = [];
    const ship = _gameState.ships[0];
    if (!ship?.colony) {
      reasons.push('尚未解锁殖民地');
      return { success: false, reasons };
    }
    const c = ship.colony;
    // 1. 科技研究 >= 10 项
    const researchedCount = c.techState?.researched?.length || 0;
    if (researchedCount < 10) {
      reasons.push(`科技研究不足（当前 ${researchedCount}/10）`);
    }
    // 2. 已研发 T25 星河奇迹
    if (!c.techState?.researched?.includes('T25')) {
      reasons.push('尚未研发「星河奇迹」科技');
    }
    // 3. 殖民地人口 >= 20
    if (c.population.total < 20) {
      reasons.push(`殖民地人口不足（当前 ${c.population.total}/20）`);
    }
    return { success: reasons.length === 0, reasons };
  }, [_gameState.ships]);

  /** 选择一座奇观开始建设 */
  const selectWonder = useCallback((wonderId: string): { success: boolean; message: string } => {
    const { success, reasons } = canStartWonder();
    if (!success) return { success: false, message: `条件未满足：${reasons.join('；')}` };

    const wonder = getWonderDef(wonderId);
    if (!wonder) return { success: false, message: '无效的奇观 ID' };

    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        const newWonderState: WonderState = {
          phase: 'building',
          selectedWonderId: wonderId as WonderState['selectedWonderId'],
          currentStage: 0,
          stageProgress: 0,
          eventPending: null,
          totalTurnsSpent: 0,
          eventHistory: [],
        };
        s.colony = { ...s.colony, wonder: newWonderState };
        // 进入第一阶段触发事件
        const ev = rollWonderEvent();
        s.colony.wonder!.eventPending = ev.id;
        s.colony.wonder!.eventHistory = [`[阶段1开始] 触发事件：${ev.name}`];
        ships[0] = s;
        result = { success: true, message: `开始建造「${wonder.name}」！触发事件：${ev.name}` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [canStartWonder, dispatch]);

  /** 提交本回合资源，推进 1 回合进度 */
  const submitWonderResources = useCallback((): { success: boolean; message: string } => {
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        const ws = s.colony.wonder;
        if (!ws || !ws.selectedWonderId) { result = { success: false, message: '尚未选择奇观' }; return prev; }
        if (ws.eventPending) { result = { success: false, message: '有事件待处理，请先处理事件' }; return prev; }

        const wonder = getWonderDef(ws.selectedWonderId);
        if (!wonder) { result = { success: false, message: '奇观数据错误' }; return prev; }

        const stage = wonder.stages[ws.currentStage];
        if (!stage) { result = { success: false, message: '已是最终阶段' }; return prev; }

        // 检查资源是否足够
        const checks: { name: string; have: number; need: number }[] = [];
        if (stage.gold > 0 && s.gold < stage.gold) checks.push({ name: '金币', have: s.gold, need: stage.gold });
        if (stage.alloy > 0 && s.alloy < stage.alloy) checks.push({ name: '合金', have: s.alloy, need: stage.alloy });
        if (stage.silicon > 0 && (s.materials.silicon || 0) < stage.silicon) checks.push({ name: '硅片', have: s.materials.silicon || 0, need: stage.silicon });
        if (stage.quantum > 0 && (s.materials.quantum || 0) < stage.quantum) checks.push({ name: '量子簇', have: s.materials.quantum || 0, need: stage.quantum });
        if (stage.dark_matter > 0 && (s.materials.dark_matter || 0) < stage.dark_matter) checks.push({ name: '暗物质', have: s.materials.dark_matter || 0, need: stage.dark_matter });
        if (stage.stardust > 0 && s.stardust < stage.stardust) checks.push({ name: '星尘', have: s.stardust, need: stage.stardust });
        if (stage.food > 0 && s.food < stage.food) checks.push({ name: '食物', have: s.food, need: stage.food });
        if (stage.carbon > 0 && (s.materials.carbon || 0) < stage.carbon) checks.push({ name: '碳块', have: s.materials.carbon || 0, need: stage.carbon });
        if (stage.oil > 0 && (s.materials.oil || 0) < stage.oil) checks.push({ name: '石油', have: s.materials.oil || 0, need: stage.oil });
        if (stage.gold_ore > 0 && (s.materials.gold_ore || 0) < stage.gold_ore) checks.push({ name: '金矿', have: s.materials.gold_ore || 0, need: stage.gold_ore });
        if (stage.research > 0 && (s.colony.techState?.researchPoints || 0) < stage.research) checks.push({ name: '科研点', have: s.colony.techState?.researchPoints || 0, need: stage.research });

        if (checks.length > 0) {
          const msgs = checks.map(c => `${c.name}不足（${c.have}/${c.need}）`);
          result = { success: false, message: msgs.join('；') };
          return prev;
        }

        // 扣除资源
        if (stage.gold > 0) {
          s.gold -= stage.gold;
          s.goldLog = [{ turn: prev.turn, amount: -stage.gold, reason: `奇观「${wonder.name}」${stage.name}阶段`, balanceAfter: s.gold }, ...(s.goldLog || [])].slice(0, 200);
        }
        if (stage.alloy > 0) s.alloy -= stage.alloy;
        if (stage.stardust > 0) s.stardust -= stage.stardust;
        if (stage.food > 0) s.food -= stage.food;
        s.materials = { ...s.materials };
        if (stage.silicon > 0) s.materials.silicon = (s.materials.silicon || 0) - stage.silicon;
        if (stage.quantum > 0) s.materials.quantum = (s.materials.quantum || 0) - stage.quantum;
        if (stage.dark_matter > 0) s.materials.dark_matter = (s.materials.dark_matter || 0) - stage.dark_matter;
        if (stage.carbon > 0) s.materials.carbon = (s.materials.carbon || 0) - stage.carbon;
        if (stage.oil > 0) s.materials.oil = (s.materials.oil || 0) - stage.oil;
        if (stage.gold_ore > 0) s.materials.gold_ore = (s.materials.gold_ore || 0) - stage.gold_ore;
        if (stage.research > 0 && s.colony.techState) {
          s.colony = { ...s.colony, techState: { ...s.colony.techState, researchPoints: s.colony.techState.researchPoints - stage.research } };
        }

        const newProgress = ws.stageProgress + 1;
        const newTotal = ws.totalTurnsSpent + 1;
        let newStage = ws.currentStage;
        let newStageProgress = newProgress;

        // 检查是否完成当前阶段
        if (newStageProgress >= stage.turns) {
          newStage++;
          newStageProgress = 0;
        }

        // 检查是否完成全部阶段
        if (newStage >= wonder.stages.length) {
          s.colony = { ...s.colony, wonder: { ...ws, currentStage: newStage, stageProgress: 0, eventPending: null, totalTurnsSpent: newTotal, eventHistory: [...ws.eventHistory, `[胜利] 奇观「${wonder.name}」建设完成！`] } };
          ships[0] = s;
          result = { success: true, message: `🎉 奇观「${wonder.name}」建设完成！你赢得了胜利！` };
          return { ...prev, ships };
        }

        // 进入下一阶段时触发事件
        let eventId = ws.eventPending;
        let eventNote = '';
        if (newStage > ws.currentStage) {
          const ev = rollWonderEvent();
          eventId = ev.id;
          eventNote = `\n⚠ 新事件：${ev.name}`;
        }

        const newWS: WonderState = {
          ...ws,
          currentStage: newStage,
          stageProgress: newStageProgress,
          eventPending: eventId,
          totalTurnsSpent: newTotal,
          eventHistory: [...ws.eventHistory, `第${newTotal}回合：完成${stage.name}阶段进度` + (eventNote ? ` | ${eventNote}` : '')],
        };
        s.colony = { ...s.colony, wonder: newWS };
        ships[0] = s;
        result = { success: true, message: `资源已缴纳！${stage.name} 进度 ${newStageProgress}/${stage.turns}${eventNote}` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  /** 处理奇观事件 */
  const handleWonderEvent = useCallback((choice: 'A' | 'B'): { success: boolean; message: string } => {
    let result = { success: false, message: '' };
    dispatch({
      type: 'FUNCTIONAL_UPDATE',
      updater: (prev) => {
        const ships = [...prev.ships];
        const s = { ...ships[0], colony: { ...ships[0].colony! } };
        const ws = s.colony.wonder;
        if (!ws || !ws.eventPending) { result = { success: false, message: '没有待处理事件' }; return prev; }

        const wonder = getWonderDef(ws.selectedWonderId!);
        if (!wonder) { result = { success: false, message: '奇观数据错误' }; return prev; }

        let newProgress = ws.stageProgress;
        let newStage = ws.currentStage;
        let historyMsg = '';

        switch (ws.eventPending) {
          case 'tech_breakthrough':
            if (choice === 'A' && s.gold >= 5000) {
              s.gold -= 5000;
              s.goldLog = [{ turn: prev.turn, amount: -5000, reason: `奇观事件：技术突破`, balanceAfter: s.gold }, ...(s.goldLog || [])].slice(0, 200);
              newProgress += 3;
              historyMsg = '技术突破：投入5,000金币，进度+3';
            } else if (choice === 'A') {
              result = { success: false, message: '金币不足5000' }; return prev;
            } else {
              historyMsg = '技术突破：选择放弃，不加不减';
            }
            break;
          case 'construction_accident':
            if (choice === 'A' && s.alloy >= 30) {
              s.alloy -= 30;
              historyMsg = '施工事故：花费30合金抢修，进度不变';
            } else if (choice === 'A') {
              result = { success: false, message: '合金不足30' }; return prev;
            } else {
              newProgress = Math.max(0, newProgress - 2);
              historyMsg = '施工事故：放任不管，倒退2回合';
            }
            break;
          case 'faction_intervention':
            if (choice === 'A' && s.gold >= 10000) {
              s.gold -= 10000;
              s.goldLog = [{ turn: prev.turn, amount: -10000, reason: `奇观事件：势力干预赔偿`, balanceAfter: s.gold }, ...(s.goldLog || [])].slice(0, 200);
              historyMsg = '势力干预：支付10,000金币，继续建设';
            } else if (choice === 'A') {
              result = { success: false, message: '金币不足10000' }; return prev;
            } else {
              historyMsg = '势力干预：拒绝赔偿，工程冻结3回合（暂停提交）';
              // 不改变进度，但在UI层面通过 eventHistory 提示
            }
            break;
          case 'unexpected_discovery':
            if (choice === 'A') {
              newProgress += 4;
              historyMsg = '意外之喜：全力研究遗迹，进度+4';
            } else {
              if (s.colony.techState) {
                s.colony = { ...s.colony, techState: { ...s.colony.techState, researchPoints: (s.colony.techState.researchPoints || 0) + 20 } };
              }
              historyMsg = '意外之喜：保守挖掘，获得20科研点';
            }
            break;
          case 'plague_outbreak':
            if (choice === 'A' && s.food >= 200) {
              s.food -= 200;
              historyMsg = '瘟疫爆发：花费200食物隔离，继续建设';
            } else if (choice === 'A') {
              result = { success: false, message: '食物不足200' }; return prev;
            } else {
              s.colony = { ...s.colony, population: { ...s.colony.population, total: Math.max(0, s.colony.population.total - 3), available: Math.max(0, s.colony.population.available - 3) } };
              newProgress = Math.max(0, newProgress - 1);
              historyMsg = '瘟疫爆发：死亡3人口，倒退1回合';
            }
            break;
          case 'sabotage':
            if (choice === 'A' && s.gold >= 5000) {
              s.gold -= 5000;
              s.goldLog = [{ turn: prev.turn, amount: -5000, reason: `奇观事件：增援安保`, balanceAfter: s.gold }, ...(s.goldLog || [])].slice(0, 200);
              historyMsg = '破坏行动：花费5,000金币安保，继续建设';
            } else if (choice === 'A') {
              result = { success: false, message: '金币不足5000' }; return prev;
            } else {
              // 随机拆除一座建筑
              const activeBuildings = s.colony.buildings.filter((b) => b.active && b.defId !== 'B27');
              if (activeBuildings.length > 0) {
                const victim = activeBuildings[Math.floor(Math.random() * activeBuildings.length)];
                s.colony = { ...s.colony, buildings: s.colony.buildings.filter((b) => b.uid !== victim.uid) };
              }
              newProgress = Math.max(0, newProgress - 3);
              historyMsg = '破坏行动：损失一座建筑，倒退3回合';
            }
            break;
          case 'leader_sacrifice':
            if (choice === 'A') {
              // 找一个3级领袖
              const l3Idx = s.colony.leaders.findIndex((l) => l.level >= 3);
              if (l3Idx >= 0) {
                s.colony = { ...s.colony, leaders: s.colony.leaders.filter((_, i) => i !== l3Idx) };
                newProgress += 8;
                historyMsg = '领袖献身：该领袖永久离开，进度+8';
              } else {
                result = { success: false, message: '没有3级领袖可以献身' }; return prev;
              }
            } else {
              historyMsg = '领袖献身：婉拒，领袖留任';
            }
            break;
        }

        // 处理进度溢出到下一阶段
        let finalStage = newStage;
        let finalProgress = newProgress;
        while (finalStage < wonder.stages.length) {
          const st = wonder.stages[finalStage];
          if (finalProgress >= st.turns) {
            finalProgress -= st.turns;
            finalStage++;
            // 进入新阶段触发新事件
            if (finalStage < wonder.stages.length) {
              const ev = rollWonderEvent();
              historyMsg += ` | 进入阶段${finalStage + 1}，触发事件：${ev.name}`;
              ws.eventPending = ev.id;
            }
          } else {
            break;
          }
        }

        if (finalStage >= wonder.stages.length) {
          s.colony = { ...s.colony, wonder: { ...ws, eventPending: null, currentStage: finalStage, stageProgress: 0, totalTurnsSpent: ws.totalTurnsSpent, eventHistory: [...ws.eventHistory, `[事件] ${historyMsg}`, `[胜利] 奇观完成！`] } };
          ships[0] = s;
          result = { success: true, message: `🎉 奇观「${wonder.name}」建设完成！你赢得了胜利！` };
          return { ...prev, ships };
        }

        const newWS: WonderState = {
          ...ws,
          currentStage: finalStage,
          stageProgress: finalProgress,
          eventPending: null, // 事件已处理
          eventHistory: [...ws.eventHistory, `[事件] ${historyMsg}`],
        };
        s.colony = { ...s.colony, wonder: newWS };
        ships[0] = s;
        result = { success: true, message: `事件已处理：${historyMsg}` };
        return { ...prev, ships };
      },
    });
    return result;
  }, [dispatch]);

  return { selectWonder, submitWonderResources, handleWonderEvent, canStartWonder };
}
