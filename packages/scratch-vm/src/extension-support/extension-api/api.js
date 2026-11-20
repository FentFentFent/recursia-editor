
const ArgumentType = require('../argument-type.js');
const BlockType = require('../block-type.js');
const StyleShape = require('../style-type.js');
const ReporterScope = require('../reporter-scope.js');
const TargetType = require('../target-type.js');
const Cast = require('../../util/cast.js');
const uid = require('../../util/uid.js');
const Color = require('../../util/color.js');





function newApi(vm,getBlockly) {
    // Even unsandboxed extensions don't gain easy access to extension internals
    const safeVm = new Proxy(vm,{
        get(target,prop, receiver) {
            if (prop == 'extensionManager') {
                return undefined;
            }


            return target[prop];
        }
    })

    const Scratch = {};
    Scratch.active = true;
    Scratch.vm = safeVm;
    Scratch.ArgumentType = ArgumentType;
    Scratch.BlockType = BlockType;
    Scratch.StyleShape = StyleShape;
    Scratch.ReporterScope = ReporterScope;
    Scratch.TargetType = TargetType;
    Scratch.runtime = vm.runtime;
    Scratch.Cast = Cast;
    Scratch.Color = Color;
    Scratch.uid = uid;
    Scratch.getBlockly = getBlockly; // () => Promise<ScratchBlocks>
    Scratch.extensions = {
        unsandboxed: true,
        isTW: false,
        isPM: false,
        isRecursia: true,
        register(extObject) {
            console.log(vm.extensionManager, vm)
            vm.extensionManager.registerExtensionObjectSync(extObject);
            const extensions = Scratch.extensions;
            extensions.register = () => {
                throw new Error("Can't register a extension through a consumed Scratch API.");
            }
            for (let key in Scratch) {
                delete Scratch[key];
            }
            Scratch.active = false;
            Scratch.extensions = extensions;
        }
    }
    return Scratch;
}




module.exports = {
    newApi
};