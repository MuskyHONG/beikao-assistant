import badger from './assets/badger.webp';
import beaver from './assets/beaver.webp';
import capybara from './assets/capybara.webp';
import hare from './assets/hare.webp';
import octopus from './assets/octopus.webp';

const artwork = { badger, beaver, capybara, hare, octopus };

export function Mascot({ animal }: { animal: keyof typeof artwork }) {
  return <img className={'mascot mascot-' + animal} src={artwork[animal]} width="520" height="520" alt="" />;
}
