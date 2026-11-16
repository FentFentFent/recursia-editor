import React from 'react';
import {fireEvent, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import {CustomProcedures} from '../../../src/containers/custom-procedures.jsx';

const makeMutation = returns => {
    const mutation = document.createElement('mutation');
    mutation.setAttribute('returns', String(returns));
    return mutation;
};

const mockMutationRoot = {
    doesReturn: false,
    warp: false,
    height: 0,
    width: 0,
    setMovable: () => {},
    setDeletable: () => {},
    onChangeFn: () => {},
    getRelativeToSurfaceXY: () => ({x: 0, y: 0}),
    moveBy: () => {},
    domToMutation: mutation => {
        mockMutationRoot.doesReturn = mutation.getAttribute('returns') === 'true';
    },
    initSvg: () => {},
    render: () => {},
    focusLastEditor_: () => {},
    getWarp: () => mockMutationRoot.warp,
    setWarp: warp => {
        mockMutationRoot.warp = warp;
    },
    getReturns: () => mockMutationRoot.doesReturn,
    setReturns: returns => {
        mockMutationRoot.doesReturn = returns;
    },
    mutationToDom: () => ({returns: mockMutationRoot.doesReturn})
};

const mockWorkspace = {
    newBlock: () => mockMutationRoot,
    addChangeListener: () => {},
    getMetrics: () => ({viewWidth: 100, viewHeight: 100, viewTop: 0}),
    dispose: () => {}
};

jest.mock('scratch-blocks', () => ({
    Theme: class Theme {},
    WidgetDiv: {hide: () => {}},
    getFocusManager: () => ({focusTree: () => {}}),
    getMainWorkspace: () => null,
    inject: () => mockWorkspace
}));

jest.mock('../../../src/containers/modal.jsx', () => {
    const MockReact = require('react');
    return props => MockReact.createElement('div', null, props.children);
});

describe('CustomProcedures', () => {
    beforeEach(() => {
        mockMutationRoot.doesReturn = false;
        mockMutationRoot.warp = false;
    });

    test('shows whether the edited procedure returns a value', () => {
        renderWithIntl(
            <CustomProcedures
                colorMode="default"
                mutator={makeMutation(true)}
                onRequestClose={() => {}}
            />
        );

        expect(screen.getByRole('checkbox', {name: /does return/i})).toBeChecked();
    });

    test('applies the does return toggle to the edited procedure', () => {
        const onRequestClose = jest.fn();
        renderWithIntl(
            <CustomProcedures
                colorMode="default"
                mutator={makeMutation(false)}
                onRequestClose={onRequestClose}
            />
        );

        const returnsCheckbox = screen.getByRole('checkbox', {name: /does return/i});
        expect(returnsCheckbox).not.toBeChecked();

        fireEvent.click(returnsCheckbox);
        expect(returnsCheckbox).toBeChecked();

        fireEvent.click(screen.getByRole('button', {name: 'OK'}));
        expect(onRequestClose).toHaveBeenCalledWith(expect.objectContaining({returns: true}));
    });
});
