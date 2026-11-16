import React from 'react';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import SpriteInfoComponent from '../../../src/components/sprite-info/sprite-info.jsx';

describe('tmp SpriteInfo', () => {
    test('renders dependencies', () => {
        const {container} = renderWithIntl(
            <SpriteInfoComponent
                name="Sprite1"
                stageSize="large"
                dependencies={['a','b','c']}
                sprites={{a:{name:'TargetName1'}, b:{name:'TargetName2'}, c:{name:'TargetName3'}}}
            />
        );
        console.log(container.outerHTML);
    });
});