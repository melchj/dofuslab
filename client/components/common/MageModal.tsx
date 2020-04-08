/** @jsx jsx */

import React from 'react';
import { jsx, ClassNames } from '@emotion/core';
import Modal from 'antd/lib/modal';
import Select, { LabeledValue } from 'antd/lib/select';
import Divider from 'antd/lib/divider';
import Button from 'antd/lib/button/button';

import { customSet_customSetById_equippedItems } from 'graphql/queries/__generated__/customSet';
import {
  getStatsMaps,
  checkAuthentication,
  useCustomSet,
  effectToIconUrl,
  elementMageToWeaponEffect,
} from 'common/utils';
import {
  Stat,
  WeaponElementMage,
  WeaponEffectType,
} from '__generated__/globalTypes';
import { MageAction } from 'common/types';
import { useTranslation } from 'i18n';
import MageInputNumber from './MageInputNumber';
import { blue6 } from 'common/mixins';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faRedo } from '@fortawesome/free-solid-svg-icons';
import { useMutation, useApolloClient } from '@apollo/react-hooks';
import {
  mageEquippedItem,
  mageEquippedItemVariables,
} from 'graphql/mutations/__generated__/mageEquippedItem';
import MageEquippedItemMutation from 'graphql/mutations/mageEquippedItem.graphql';
import { mq } from 'common/constants';
import { WeaponEffectsList, TruncatableText } from 'common/wrappers';

const { Option } = Select;

interface IProps {
  visible: boolean;
  equippedItem: customSet_customSetById_equippedItems;
  closeMageModal: (e: React.MouseEvent<HTMLElement>) => void;
  customSetId: string;
}

interface StatLine {
  stat: Stat;
  value: number;
}

interface MageState {
  originalStats: ReadonlyArray<StatLine>;
  exos: Array<StatLine>;
}

const statLineCss = {
  position: 'relative' as 'relative',
  display: 'flex',
  alignItems: 'center',
  height: 42,
  marginLeft: 24,
  minWidth: 0,
};

const deleteStatWrapper = {
  position: 'absolute' as 'absolute',
  left: -24,
  top: 3,
  padding: 8,
  opacity: 0.3,
  transition: 'opacity 0.3s',
  cursor: 'pointer',
  ['&:hover']: {
    opacity: 1,
  },
};

const reducer = (state: MageState, action: MageAction) => {
  let idx = -1;
  switch (action.type) {
    case 'ADD':
      if (
        state.exos.some(({ stat }) => action.stat === stat) ||
        state.originalStats.some(({ stat }) => action.stat === stat)
      ) {
        return state;
      }
      return {
        ...state,
        exos: [...state.exos, { stat: action.stat, value: 1 }],
      };
    case 'REMOVE':
      const exosCopy = [...state.exos];
      idx = exosCopy.findIndex(({ stat }) => stat === action.stat);
      if (idx === -1) return state;
      exosCopy.splice(idx, 1);
      return { ...state, exos: exosCopy };
    case 'EDIT':
      const stateCopy = { ...state };
      if (action.isExo) {
        idx = stateCopy.exos.findIndex(({ stat }) => stat === action.stat);
        stateCopy.exos[idx] = { stat: action.stat, value: action.value };
      } else {
        idx = stateCopy.originalStats.findIndex(
          ({ stat }) => stat === action.stat,
        );
        stateCopy.originalStats[idx].value = action.value;
      }
      return stateCopy;
    case 'RESET':
      return {
        originalStats: state.originalStats.map(({ stat }) => ({
          stat,
          value: action.originalStatsMap[stat].value,
        })),
        exos: [],
      };
    default:
      throw new Error('Invalid action type');
  }
};

const calcStatsDiff = (
  originalStatsMap: { [key: string]: { value: number } },
  statsState: MageState,
) => [
  ...statsState.originalStats
    .map(({ stat, value }) => ({
      stat,
      value: value - (originalStatsMap[stat].value || 0),
    }))
    .filter(({ value }) => value !== 0),
  ...statsState.exos,
];

const MageModal: React.FC<IProps> = ({
  visible,
  equippedItem,
  closeMageModal,
  customSetId,
}) => {
  const { statsMap, exoStatsMap, originalStatsMap } = getStatsMaps(
    equippedItem.item.stats,
    equippedItem.exos,
  );

  const [statsState, dispatch] = React.useReducer(reducer, {
    originalStats: equippedItem.item.stats
      .filter(({ stat, maxValue }) => !!stat && !!maxValue)
      .map(({ stat }) => ({
        stat: stat!,
        value: statsMap[stat!].value,
      })),
    exos: equippedItem.exos
      .filter(({ stat }) => !!exoStatsMap[stat])
      .map(({ stat }) => ({
        stat,
        value: exoStatsMap[stat],
      })),
  });

  const [weaponElementMage, setWeaponElementMage] = React.useState<
    WeaponElementMage | undefined
  >();

  const [mutate] = useMutation<mageEquippedItem, mageEquippedItemVariables>(
    MageEquippedItemMutation,
    {
      variables: {
        equippedItemId: equippedItem.id,
        stats: calcStatsDiff(originalStatsMap, statsState),
        weaponElementMage,
      },
      optimisticResponse: ({ stats }) => ({
        mageEquippedItem: {
          equippedItem: {
            ...equippedItem,
            exos: stats.map((line, idx) => ({
              ...line,
              id: `exo-${idx}`,
              __typename: 'EquippedItemExo',
            })),
          },
          __typename: 'MageEquippedItem',
        },
      }),
    },
  );

  const { exoStatsMap: tempExoStatsMap } = getStatsMaps(
    statsState.originalStats,
    statsState.exos,
  );

  const statsSet = new Set<Stat>();
  statsState.originalStats.forEach(({ stat }) => statsSet.add(stat));
  statsState.exos.forEach(({ stat }) => statsSet.add(stat));

  const { t } = useTranslation(['stat', 'mage', 'weapon_spell_effect']);

  const onAddStat = React.useCallback(
    ({ value }: LabeledValue) => {
      dispatch({ type: 'ADD', stat: value as Stat });
    },
    [dispatch],
  );

  const client = useApolloClient();
  const customSet = useCustomSet(customSetId);

  const onOk = React.useCallback(
    async (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      const ok = checkAuthentication(client, t, customSet);
      if (!ok) return;
      mutate();
      closeMageModal(e);
    },
    [mutate, closeMageModal, client, t, customSet],
  );

  const hasNeutralDamage = equippedItem.item.weaponStats?.weaponEffects.some(
    ({ effectType }) => effectType === WeaponEffectType.NEUTRAL_DAMAGE,
  );

  return (
    <ClassNames>
      {({ css }) => (
        <Modal
          visible={visible}
          title={
            <div css={{ fontSize: '0.8rem' }}>
              {t('MAGE_MODAL_TITLE', {
                ns: 'mage',
                itemName: equippedItem.item.name,
              })}
            </div>
          }
          bodyStyle={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
          onCancel={closeMageModal}
          onOk={onOk}
          zIndex={1061} // higher than popover (1030) and tooltip (1060)
        >
          {equippedItem.item.weaponStats && (
            <>
              <div
                css={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  alignSelf: 'stretch',
                }}
              >
                <WeaponEffectsList
                  css={{ marginLeft: 24 }}
                  weaponStats={equippedItem.item.weaponStats}
                  innerDivStyle={{ marginBottom: 8 }}
                  elementMage={weaponElementMage}
                />
                {hasNeutralDamage && (
                  <div css={{ position: 'relative', marginLeft: 24 }}>
                    <div
                      css={deleteStatWrapper}
                      onClick={() => {
                        setWeaponElementMage(undefined);
                      }}
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </div>
                    <Select<WeaponElementMage>
                      size="large"
                      value={weaponElementMage}
                      onChange={setWeaponElementMage}
                      dropdownClassName={css({ zIndex: 1062 })}
                      css={{ width: '100%', fontSize: '0.75rem' }}
                    >
                      {Object.values(WeaponElementMage).map(v => (
                        <Option key={v} value={v}>
                          <div css={{ display: 'flex', alignItems: 'center' }}>
                            <img
                              src={effectToIconUrl(
                                elementMageToWeaponEffect(v),
                              )}
                              css={{ width: 16, marginRight: 8 }}
                            />{' '}
                            {t(`WEAPON_ELEMENT_MAGE.${v}`, {
                              ns: 'weapon_spell_effect',
                            })}
                          </div>
                        </Option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
              <Divider css={{ margin: '12px 0' }} />
            </>
          )}
          <div
            css={{
              fontSize: '0.75rem',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gridTemplateRows: 'auto',
              [mq[1]]: {
                gridTemplateColumns: 'repeat(2, 1fr)',
                gridTemplateRows: 'none',
              },
              gridRowGap: 4,
              gridColumnGap: 12,
            }}
          >
            {statsState.originalStats.map(statLine => (
              <div key={`original-${statLine.stat}`} css={statLineCss}>
                <div
                  css={deleteStatWrapper}
                  onClick={() => {
                    dispatch({
                      type: 'EDIT',
                      stat: statLine.stat,
                      value: 0,
                      isExo: false,
                    });
                  }}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </div>
                <MageInputNumber
                  value={statLine.value}
                  stat={statLine.stat}
                  dispatch={dispatch}
                  isExo={false}
                />
                /{' '}
                <TruncatableText>
                  {originalStatsMap[statLine.stat].value} {t(statLine.stat)}
                </TruncatableText>
              </div>
            ))}
            <Divider css={{ gridColumn: '1 / -1' }} />
            {statsState.exos
              .filter(({ stat }) => tempExoStatsMap[stat] !== undefined)
              .map(statLine => {
                return (
                  <div
                    key={`exo-${statLine.stat}`}
                    css={{ ...statLineCss, color: blue6 }}
                  >
                    <div
                      css={deleteStatWrapper}
                      onClick={() => {
                        dispatch({ type: 'REMOVE', stat: statLine.stat });
                      }}
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </div>
                    <MageInputNumber
                      value={statLine.value}
                      stat={statLine.stat}
                      dispatch={dispatch}
                      isExo={true}
                    />
                    {t(statLine.stat)}
                  </div>
                );
              })}
            <div
              css={{
                display: 'flex',
                height: 42,
                alignItems: 'center',
                marginLeft: 24,
              }}
            >
              <Select
                size="large"
                autoClearSearchValue
                showSearch
                onSelect={onAddStat}
                css={{ fontSize: '0.75rem', width: '100%' }}
                labelInValue
                filterOption={(input, option) =>
                  (option?.children as string)
                    .toLocaleUpperCase()
                    .includes(input.toLocaleUpperCase())
                }
                dropdownClassName={css({ zIndex: 1062 })} // higher than modal (1061)
              >
                {Object.values(Stat).map(stat => (
                  <Option
                    key={stat}
                    value={stat}
                    disabled={statsSet.has(stat)}
                    className={css({
                      ['.ant-select-item-option-content']: {
                        fontSize: '0.75rem',
                      },
                    })}
                  >
                    {t(stat, { ns: 'stat' })}
                  </Option>
                ))}
              </Select>
            </div>
            <div
              css={{ display: 'flex', alignItems: 'center', marginLeft: 24 }}
            >
              <Button
                size="large"
                css={{ fontSize: '0.75rem' }}
                onClick={() => {
                  dispatch({ type: 'RESET', originalStatsMap });
                  setWeaponElementMage(undefined);
                }}
              >
                <FontAwesomeIcon icon={faRedo} />
                <span css={{ marginLeft: 8 }}>
                  {t('RESET_TO_ORIGINAL', { ns: 'mage' })}
                </span>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </ClassNames>
  );
};

export default MageModal;
